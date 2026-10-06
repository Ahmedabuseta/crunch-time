import { describe, it, expect } from 'vitest'
import {
  normalizeReceiptInfo,
  receiptContactLines,
  receiptLegalLine,
  receiptLines,
  safeLogoSrc,
  RECEIPT_INFO_DEFAULTS,
} from '../lib/receipt'
import { buildCustomerReceiptHtml, buildKitchenTicketHtml, receiptItemRows, type PrintOrder } from '../lib/print'

const LOGO = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function sampleOrder(over: Partial<PrintOrder> = {}): PrintOrder {
  return {
    id: '1042',
    orderType: 'delivery',
    customerName: 'أحمد سيد',
    customerPhone: '01001234567',
    customerAddress: '12 شارع الهرم',
    deliveryZoneName: 'فيصل',
    deliveryNote: 'الاتصال قبل التوصيل',
    deliveryProfileName: 'كريم',
    cashierName: 'محمد علي',
    createdAt: new Date('2026-03-12T14:32:00Z'),
    items: [
      { productName: 'برجر كلاسيك', quantity: 2, unitPrice: 120, addons: [{ name: 'جبنة', price: 15, qty: 1 }] },
      { productName: 'كريب عربي', quantity: 1, unitPrice: 85, note: 'بدون بصل' },
    ],
    subtotal: 355,
    tax: 49.7,
    taxRate: 0.14,
    deliveryFee: 35,
    discountAmount: 20,
    discountCode: 'SAVE10',
    total: 419.7,
    paymentType: 'cash',
    ...over,
  }
}

describe('normalizeReceiptInfo', () => {
  it('falls back to printable defaults when the settings row is missing', () => {
    const info = normalizeReceiptInfo(undefined)
    expect(info.storeName).toBe(RECEIPT_INFO_DEFAULTS.storeName)
    expect(info.currencyLabel).toBe('ج.م')
    expect(info.footer).toBe('شكراً لزيارتكم')
    expect(info.showTax).toBe(true)
  })

  it('reads every admin field from the settings row', () => {
    const info = normalizeReceiptInfo({
      restaurantName: '  كريب هاوس  ',
      storeTagline: 'بيتزا و برجر',
      storeLogo: LOGO,
      storePhone: '0100 123 4567',
      storePhone2: '0111 222 3333',
      storeAddress: 'شارع الهرم',
      taxNumber: '123456',
      vatNumber: '987654',
      receiptFooter: 'شكراً لك',
      receiptTerms: 'الاستبدال خلال 14 يوم',
      receiptSocial: '@kareeb',
      currencyLabel: 'E£',
    })
    expect(info.storeName).toBe('كريب هاوس')
    expect(info.tagline).toBe('بيتزا و برجر')
    expect(info.logo).toBe(LOGO)
    expect(info.address).toBe('شارع الهرم')
    expect(info.footer).toBe('شكراً لك')
    expect(info.currencyLabel).toBe('E£')
  })

  it('converts sqlite 0/1 integers into booleans', () => {
    const info = normalizeReceiptInfo({ showLogo: 0, showCashier: 1, showOrderId: 0, showTax: 1 })
    expect(info.showLogo).toBe(false)
    expect(info.showCashier).toBe(true)
    expect(info.showOrderId).toBe(false)
    expect(info.showTax).toBe(true)
  })

  it('rejects a logo that is not an inline raster data URL', () => {
    expect(safeLogoSrc('https://evil.example/logo.png')).toBe('')
    expect(safeLogoSrc('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=')).toBe('')
    expect(safeLogoSrc(LOGO)).toBe(LOGO)
  })

  it('falls back to the default footer when the admin clears it', () => {
    expect(normalizeReceiptInfo({ receiptFooter: '   ' }).footer).toBe('شكراً لزيارتكم')
  })
})

describe('receipt branding helpers', () => {
  it('builds one phone line from both numbers plus the address', () => {
    const lines = receiptContactLines(normalizeReceiptInfo({ storePhone: '0100 123 4567', storePhone2: '0111 222 3333', storeAddress: 'الجيزة' }))
    expect(lines).toHaveLength(2)
    expect(lines[0]).toContain('01001234567')
    expect(lines[1]).toBe('الجيزة')
  })

  it('combines commercial + VAT numbers into one legal line', () => {
    expect(receiptLegalLine(normalizeReceiptInfo({ taxNumber: '123', vatNumber: '456' }))).toBe('س.ت: 123 — رقم ضريبي: 456')
    expect(receiptLegalLine(normalizeReceiptInfo({}))).toBe('')
  })

  it('splits multi-line terms and drops blanks', () => {
    expect(receiptLines('سطر أول\n\n  سطر ثاني  \n')).toEqual(['سطر أول', 'سطر ثاني'])
  })
})

describe('receiptItemRows', () => {
  it('splits addons out of the product row and multiplies by item quantity', () => {
    const rows = receiptItemRows({
      productName: 'برجر كلاسيك', quantity: 3, unitPrice: 100,
      addons: [{ name: 'جبنة', price: 15, qty: 2 }],
    })
    expect(rows).toEqual([
      { kind: 'item', name: 'برجر كلاسيك', qty: 3, unitPrice: 100, total: 300 },
      { kind: 'addon', name: 'جبنة', qty: 6, unitPrice: 15, total: 90 },
    ])
  })

  it('keeps free modifiers inline but prices adjustments as their own row', () => {
    const rows = receiptItemRows({
      productName: 'بيتزا', quantity: 1, unitPrice: 80,
      modifiers: [{ modifierName: 'جبن شيدر', priceAdjustment: 10 }, { modifierName: 'زيتون', priceAdjustment: 0 }],
    })
    // the paid one is pulled out of the name so it is not listed twice
    expect(rows[0].name).toBe('بيتزا (زيتون)')
    expect(rows[1]).toEqual({ kind: 'addon', name: 'تعديل: جبن شيدر', qty: 1, unitPrice: 10, total: 10 })
    expect(rows).toHaveLength(2)
  })

  it('reads modifiers and addons from the JSON columns when the arrays are absent', () => {
    const rows = receiptItemRows({
      productName: 'كريب', quantity: 2, unitPrice: 50,
      selectedModifiersJson: JSON.stringify([{ modifierName: 'حار', priceAdjustment: 0 }, { modifierName: 'جبن', priceAdjustment: 5 }]),
      selectedAddonsJson: JSON.stringify([' addition ']),
    })
    expect(rows[0].name).toBe('كريب (حار)')
    expect(rows[1]).toEqual({ kind: 'addon', name: ' addition ', qty: 2, unitPrice: 0, total: 0 })
    expect(rows[2]).toEqual({ kind: 'addon', name: 'تعديل: جبن', qty: 2, unitPrice: 5, total: 10 })
  })

  it('falls back to the array modifiers when the JSON column is empty', () => {
    const rows = receiptItemRows({ productName: 'بيتزا', quantity: 1, unitPrice: 50, selectedModifiersJson: '[]', modifiers: [{ modifierName: 'زيتون' }] })
    expect(rows[0].name).toBe('بيتزا (زيتون)')
  })

  it('never double counts: the الإجمالي column sums to the order subtotal', () => {
    const items = sampleOrder().items
    const sum = items
      .flatMap(receiptItemRows)
      .filter((r) => r.kind !== 'note')
      .reduce((s, r) => s + r.total, 0)
    // burger 2×(120+15) = 270, crepe 1×85 = 85 → 355, which is the sample subtotal
    expect(sum).toBe(355)
    expect(sum).toBe(sampleOrder().subtotal)
  })

  it('keeps the full modifier list on the kitchen ticket even when priced', () => {
    const html = buildKitchenTicketHtml(sampleOrder({
      items: [{ productName: 'بيتزا', quantity: 1, unitPrice: 80, modifiers: [{ modifierName: 'جبن شيدر', priceAdjustment: 10 }] }],
    }), [{ productName: 'بيتزا', quantity: 1, unitPrice: 80, modifiers: [{ modifierName: 'جبن شيدر', priceAdjustment: 10 }] }], 'مطبخ 1', '72mm')
    // the kitchen needs the name, and still must never show prices
    expect(html).toContain('جبن شيدر')
    expect(html).not.toContain('تعديل')
    expect(html).not.toContain('80')
  })

  it('emits a note row carrying only text', () => {
    const rows = receiptItemRows({ productName: 'رجر', quantity: 1, unitPrice: 90, note: '  بدون بصل  ' })
    expect(rows[1]).toEqual({ kind: 'note', name: 'بدون بصل', qty: 0, unitPrice: 0, total: 0 })
  })

  it('survives an item with no price, quantity or data', () => {
    expect(receiptItemRows({ quantity: 0 })).toEqual([{ kind: 'item', name: '', qty: 0, unitPrice: 0, total: 0 }])
    expect(receiptItemRows({ productName: 'شاي', quantity: 2, unitPrice: 15, addons: [{ name: 'سكر', price: 2 }] })[1])
      .toEqual({ kind: 'addon', name: 'سكر', qty: 2, unitPrice: 2, total: 4 })
  })

  it('never yields NaN or undefined numbers', () => {
    const rows = receiptItemRows({
      productName: 'سموذي', quantity: 1, unitPrice: undefined,
      addons: [{ name: 'حليب', price: undefined, qty: undefined }],
    })
    for (const r of rows) {
      expect(Number.isFinite(r.qty)).toBe(true)
      expect(Number.isFinite(r.unitPrice)).toBe(true)
      expect(Number.isFinite(r.total)).toBe(true)
    }
  })
})

describe('buildCustomerReceiptHtml', () => {
  const info = normalizeReceiptInfo({
    restaurantName: 'كريب هاوس',
    storeTagline: 'بيتزا و برجر',
    storePhone: '01001234567',
    storeAddress: '15 شارع الهرم، الجيزة',
    taxNumber: '123456',
    vatNumber: '987654',
    receiptFooter: 'شكراً لزيارتكم',
    receiptTerms: 'الاستبدال خلال 14 يوم',
    receiptSocial: '@kareebhouse',
    currencyLabel: 'ج.م',
  })

  it('prints the shop letterhead, legal numbers and footer', () => {
    const html = buildCustomerReceiptHtml(sampleOrder(), '72mm', info)
    expect(html).toContain('كريب هاوس')
    expect(html).toContain('بيتزا و برجر')
    expect(html).toContain('15 شارع الهرم، الجيزة')
    expect(html).toContain('س.ت: 123456 — رقم ضريبي: 987654')
    expect(html).toContain('شكراً لزيارتكم')
    expect(html).toContain('الاستبدال خلال 14 يوم')
    expect(html).toContain('@kareebhouse')
    expect(html).toContain('إيصال مبيعات')
  })

  it('never hardcodes the legacy store name', () => {
    expect(buildCustomerReceiptHtml(sampleOrder(), '72mm', info)).not.toContain('Crunch Time')
  })

  it('renders the logo only when one is set and enabled', () => {
    const withLogo = normalizeReceiptInfo({ restaurantName: 'كريب هاوس', storeLogo: LOGO })
    expect(buildCustomerReceiptHtml(sampleOrder(), '72mm', withLogo)).toContain(`src="${LOGO}"`)
    expect(buildCustomerReceiptHtml(sampleOrder(), '72mm', { ...withLogo, showLogo: false })).not.toContain(`src="${LOGO}"`)
  })

  it('prints the items as a four-column table', () => {
    const html = buildCustomerReceiptHtml(sampleOrder(), '72mm', info)
    expect(html).toContain('<table class="items">')
    expect(html).toContain('<th>الصنف</th>')
    expect(html).toContain('الكمية')
    expect(html).toContain('سعر الوحدة')
    expect(html).toContain('الإجمالي')
    expect(html).toContain('برجر كلاسيك')
    expect(html).toContain('كريب عربي')
  })

  it('gives every addon its own table row with quantity and total', () => {
    const html = buildCustomerReceiptHtml(sampleOrder(), '72mm', info)
    // burger: base row (2 × 120 = 240) then the addon row (2 × 15 = 30)
    expect(html).toContain('<tr class="item">')
    // the addon is the last row of its group, so it also carries the group-end rule
    expect(html).toContain('<tr class="addon group-end">')
    expect(html).toMatch(/<td>جبنة<\/td><td class="num">2<\/td><td class="num">15<\/td><td class="num">30<\/td>/)
  })

  it('spans the whole width for an item note', () => {
    const html = buildCustomerReceiptHtml(sampleOrder(), '72mm', info)
    expect(html).toContain('<td colspan="4">بدون بصل</td>')
  })

  it('uses the configured currency label for every amount', () => {
    const html = buildCustomerReceiptHtml(sampleOrder(), '72mm', { ...info, currencyLabel: '£' })
    expect(html).toContain('419.7 £')
    expect(html).not.toContain('ج.م')
  })

  it('honours the cashier / order-id / tax visibility toggles', () => {
    const html = buildCustomerReceiptHtml(sampleOrder(), '72mm', info)
    expect(html).toContain('محمد علي')
    expect(html).toContain('1042')
    expect(html).toContain('ضريبة القيمة المضافة (14%)')

    const hidden = buildCustomerReceiptHtml(sampleOrder(), '72mm', {
      ...info, showCashier: false, showOrderId: false, showTax: false,
    })
    expect(hidden).not.toContain('محمد علي')
    expect(hidden).not.toContain('>1042<')
    expect(hidden).not.toContain('ضريبة القيمة المضافة')
    // totals still print
    expect(hidden).toContain('419.7')
  })

  it('keeps totals consistent with the order and shows the discount code', () => {
    const html = buildCustomerReceiptHtml(sampleOrder(), '72mm', info)
    expect(html).toContain('SAVE10')
    expect(html).toContain('-20')
    expect(html).toContain('الإجمالي المستحق')
    expect(html).toContain('رسوم التوصيل (فيصل)')
  })

  it('escapes user-controlled text so the ticket cannot be broken', () => {
    const html = buildCustomerReceiptHtml(sampleOrder({ note: '<script>alert(1)</script>' }), '72mm', info)
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('prints the legal numbers and the store name exactly once', () => {
    const html = buildCustomerReceiptHtml(sampleOrder(), '72mm', info)
    const legal = 'س.ت: 123456 — رقم ضريبي: 987654'
    expect(html.split(legal).length - 1).toBe(1)
    expect(html.split('كريب هاوس').length - 1).toBe(1)
  })

  it('keeps the item row unit price exclusive of addons so the column adds up', () => {
    // 2 × 120 = 240, plus the addon row 2 × 15 = 30 → 270, and never double-counted
    const html = buildCustomerReceiptHtml(sampleOrder(), '72mm', info)
    expect(html).toContain('<td>برجر كلاسيك</td><td class="num">2</td><td class="num">120</td><td class="num">240</td>')
    expect(html).not.toContain('سعر الوحدة 135')
  })

  it('stays clean when the admin filled nothing but the name', () => {
    const bare = normalizeReceiptInfo({ restaurantName: 'محلي' })
    const html = buildCustomerReceiptHtml(sampleOrder(), '72mm', bare)
    expect(html).toContain('محلي')
    expect(html).not.toContain('س.ت:')
    expect(html).not.toContain('<img')
    expect(html).toContain('شكراً لزيارتكم')
  })

  it('survives an order with no items, fees or notes', () => {
    const empty = sampleOrder({
      items: [], subtotal: 0, tax: 0, deliveryFee: 0, discountAmount: 0,
      total: 0, note: undefined, discountCode: undefined,
      orderType: 'dine-in', customerName: undefined, customerPhone: undefined,
      customerAddress: undefined, deliveryZoneName: undefined, deliveryNote: undefined,
      deliveryProfileName: undefined, cashierName: undefined,
    })
    const html = buildCustomerReceiptHtml(empty, '72mm', info)
    expect(html).toContain('لا توجد أصناف')
    expect(html).toContain('عدد الأصناف')
    expect(html).not.toContain('رسوم التوصيل')
    expect(html).not.toContain('الخصم')
  })

  it('falls back to the default branding when no info is supplied', () => {
    const html = buildCustomerReceiptHtml(sampleOrder())
    expect(html).toContain(RECEIPT_INFO_DEFAULTS.storeName)
    expect(html).toContain('ج.م')
  })
})

describe('buildKitchenTicketHtml', () => {
  it('uses the same letterhead but never prints prices', () => {
    const info = normalizeReceiptInfo({ restaurantName: 'كريب هاوس', storePhone: '01001234567' })
    const html = buildKitchenTicketHtml(sampleOrder(), sampleOrder().items, 'مطبخ 1', '72mm', info)
    expect(html).toContain('كريب هاوس')
    expect(html).toContain('مطبخ 1')
    expect(html).toContain('برجر كلاسيك')
    expect(html).not.toContain('419.7')
  })
})