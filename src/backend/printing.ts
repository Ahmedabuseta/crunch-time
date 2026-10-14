// Main-process printing for the remote POS server.
//
// The desktop prints from the renderer (src/lib/print.ts → window.api), but the
// HTTP server runs in the main process with no renderer. This module reuses the
// exact same pure builders (customer receipt + kitchen tickets) and the same
// routing (stations.routeOrder) and print path (getElectron().print) so a phone
// sale produces byte-identical paper to a till sale.
import { getElectron } from './electron'
import * as orders from './orders'
import * as stations from './stations'
import { getSettings } from './settings'
import {
  buildCustomerReceiptHtml,
  buildKitchenTicketHtml,
  collectKitchenItems,
  contentWidth,
  markKitchenTicketItems,
  type PrintItem,
  type PrintOrder,
} from '../lib/print'
import { normalizeReceiptInfo } from '../lib/receipt'

export interface PrintOutcome {
  receipt: { ok: boolean; error?: string } | null
  kitchen: { station: string; ok: boolean; error?: string }[]
  unrouted: number
}

/** Loads an order from the DB and shapes it for the print builders. */
async function loadPrintOrder(orderId: string): Promise<PrintOrder | null> {
  const order = await orders.getOrderById(orderId)
  if (!order) return null
  return {
    id: order.id,
    orderType: order.orderType,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerAddress: order.customerAddress,
    deliveryZoneName: order.deliveryZoneName,
    deliveryNote: order.deliveryNote,
    deliveryProfileName: order.deliveryProfileName,
    note: order.note,
    cashierName: order.cashierName,
    createdAt: order.createdAt,
    items: (order.items || []).map((i: any): PrintItem => ({
      id: i.id,
      productName: i.productName,
      productEmoji: i.productEmoji,
      quantity: i.quantity,
      unitPrice: i.unitPrice,
      note: i.note,
      selectedModifiersJson: i.selectedModifiersJson,
      selectedAddonsJson: i.selectedAddonsJson,
      addonRollbackInfo: i.addonRollbackInfo,
    })),
    subtotal: order.subtotal,
    tax: order.tax,
    deliveryFee: order.deliveryFee,
    discountAmount: order.discountAmount,
    discountCode: order.discountCode,
    total: order.total,
    paymentType: order.paymentType,
  }
}

/**
 * Prints the customer receipt and the routed kitchen tickets for an order.
 * Mirrors the desktop's printOrderPack rules (no printer on a station, one
 * ticket per printer, unrouted count). Printing never throws — a failed print
 * is reported back so the caller can surface it without losing the sale.
 */
export async function printOrderById(
  orderId: string,
  opts?: { autoReceipt?: boolean; autoKitchen?: boolean },
): Promise<PrintOutcome> {
  const order = await loadPrintOrder(orderId)
  if (!order) return { receipt: null, kitchen: [], unrouted: 0 }

  const settings: any = getSettings()
  const info = normalizeReceiptInfo(settings)
  const autoReceipt = opts?.autoReceipt ?? settings.autoPrintReceipt ?? true
  const autoKitchen = opts?.autoKitchen ?? settings.autoPrintKitchen ?? true
  const paperWidth = settings.receiptWidth || '80mm'
  const print = getElectron().print

  let receipt: { ok: boolean; error?: string } | null = null
  if (autoReceipt) {
    receipt = await print(
      buildCustomerReceiptHtml(order, contentWidth(paperWidth), info),
      settings.receiptPrinter || null,
      settings.receiptCopies || 1,
      paperWidth,
    )
  }

  const kitchen: { station: string; ok: boolean; error?: string }[] = []
  let unrouted = 0
  if (autoKitchen) {
    try {
      const routed = await stations.routeOrder(orderId)
      const allKitchenItems = collectKitchenItems(routed.routes || [], routed.unrouted || [])
      const usedPrinters = new Set<string>()
      for (const r of routed.routes) {
        if (!r.station.printerName) {
          kitchen.push({ station: r.station.name, ok: false, error: 'مفيش طابعة مربوطة' })
          continue
        }
        if (usedPrinters.has(r.station.printerName)) {
          kitchen.push({ station: r.station.name, ok: false, error: 'الطابعة مستخدمة في محطة أخرى — تم منع تكرار الطباعة' })
          continue
        }
        usedPrinters.add(r.station.printerName)
        if (allKitchenItems.length === 0) continue
        const stPaper = r.station.paperWidth || '80mm'
        const html = buildKitchenTicketHtml(order, markKitchenTicketItems(allKitchenItems, r.items), r.station.name, contentWidth(stPaper), info)
        const res = await print(html, r.station.printerName, settings.kitchenCopies || 1, stPaper)
        kitchen.push({ station: r.station.name, ok: res.ok, error: res.error })
      }
      unrouted = routed.unrouted?.length || 0
    } catch (err: any) {
      kitchen.push({ station: 'التوجيه', ok: false, error: err?.message || 'فشل التوجيه' })
    }
  }

  return { receipt, kitchen, unrouted }
}

/** Re-print just the customer receipt (used by the phone's "print" action). */
export async function printReceiptOnly(orderId: string): Promise<{ ok: boolean; error?: string }> {
  const order = await loadPrintOrder(orderId)
  if (!order) return { ok: false, error: 'الطلب غير موجود' }
  const settings: any = getSettings()
  const paperWidth = settings.receiptWidth || '80mm'
  return getElectron().print(
    buildCustomerReceiptHtml(order, contentWidth(paperWidth), normalizeReceiptInfo(settings)),
    settings.receiptPrinter || null,
    settings.receiptCopies || 1,
    paperWidth,
  )
}

/** Re-print just the kitchen tickets for an order. */
export async function printKitchenOnly(orderId: string): Promise<PrintOutcome> {
  return printOrderById(orderId, { autoReceipt: false, autoKitchen: true })
}
