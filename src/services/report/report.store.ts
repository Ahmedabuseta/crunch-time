import { create } from 'zustand'
import type { DailySummary, HourlyBreakdown, ItemPerformance, CategoryPerformance, AddonPerformance, TicketDistribution, OrderTypeSplit, RevenueTrendPoint, PaymentMethodBreakdown, AbcXyzReport, InventoryTurnoverReport, PpvReport, SalesTrendReport, DaysOnHandReport } from './report.types'

interface ReportStore {
  dashboard: DailySummary | null
  hourly: HourlyBreakdown[]
  topItems: ItemPerformance[]
  categoryRevenue: CategoryPerformance[]
  addonStats: AddonPerformance[]
  ticketDist: TicketDistribution[]
  orderTypeSplit: OrderTypeSplit | null
  revenueTrend: RevenueTrendPoint[]
  paymentMethods: PaymentMethodBreakdown[]
  inventoryAlerts: any[]
  profitSummary: any
  transactions: any[]
  shiftSummary: any
  laborSummary: any
  voidSummary: any
  abcXyz: AbcXyzReport | null
  turnover: InventoryTurnoverReport | null
  ppv: PpvReport | null
  salesTrend: SalesTrendReport | null
  daysOnHand: DaysOnHandReport | null
  loading: boolean
  dateRange: { from: string; to: string }
  refreshDashboard: (date?: string) => Promise<void>
  refreshAll: (from?: string, to?: string) => Promise<void>
  refreshRevenueTrend: (days?: number) => Promise<void>
  refreshSalesTrend: (opts?: { days?: number; forecastDays?: number }) => Promise<void>
  setDateRange: (from: string, to: string) => void
}

export const useReportStore = create<ReportStore>((set) => ({
  dashboard: null,
  hourly: [],
  topItems: [],
  categoryRevenue: [],
  addonStats: [],
  ticketDist: [],
  orderTypeSplit: null,
  revenueTrend: [],
  paymentMethods: [],
  inventoryAlerts: [],
  profitSummary: null,
  transactions: [],
  shiftSummary: null,
  laborSummary: null,
  voidSummary: null,
  abcXyz: null,
  turnover: null,
  ppv: null,
  salesTrend: null,
  daysOnHand: null,
  loading: false,
  dateRange: { from: new Date().toISOString().slice(0, 10), to: new Date().toISOString().slice(0, 10) },

  refreshDashboard: async (date?) => {
    set({ loading: true })
    const [summary, hourly] = await Promise.all([
      window.api.report.dailySummary(date),
      window.api.report.hourlyBreakdown(date),
    ])
    set({ dashboard: summary as DailySummary, hourly: hourly as HourlyBreakdown[], loading: false })
  },

  refreshAll: async (from?, to?) => {
    set({ loading: true })
    const [summary, hourly, topItems, catRev, addonStats, ticketDist, split, payMethods, invAlerts, profit, transactions, shiftData, laborData, voidData, abcXyz, turnover, ppv, daysOnHand] = await Promise.all([
      window.api.report.periodSummary(from, to),
      window.api.report.hourlyBreakdown(from),
      window.api.report.topItems(10, from, to),
      window.api.report.categoryRevenue(from, to),
      window.api.report.addonStats(from, to),
      window.api.report.ticketDistribution(from, to),
      window.api.report.orderTypeSplit(from, to),
      window.api.report.paymentMethodBreakdown(from, to),
      window.api.report.inventoryAlerts(),
      window.api.report.profitSummary(from, to),
      window.api.order.list({ from, to }) as Promise<any[]>,
      window.api.report.shiftSummary(from, to),
      window.api.report.laborSummary(from, to),
      window.api.report.voidSummary(from, to),
      window.api.report.abcXyz(from, to),
      window.api.report.inventoryTurnover(from, to),
      window.api.report.purchasePriceVariance(from, to),
      window.api.report.daysOnHand(),
    ])
    set({
      dashboard: summary as DailySummary,
      hourly: hourly as HourlyBreakdown[],
      topItems: topItems as ItemPerformance[],
      categoryRevenue: catRev as CategoryPerformance[],
      addonStats: addonStats as AddonPerformance[],
      ticketDist: ticketDist as TicketDistribution[],
      orderTypeSplit: split as OrderTypeSplit,
      paymentMethods: payMethods as PaymentMethodBreakdown[],
      inventoryAlerts: invAlerts as any[],
      profitSummary: profit,
      transactions: transactions as any[],
      shiftSummary: shiftData,
      laborSummary: laborData,
      voidSummary: voidData,
      abcXyz: abcXyz as AbcXyzReport,
      turnover: turnover as InventoryTurnoverReport,
      ppv: ppv as PpvReport,
      daysOnHand: daysOnHand as DaysOnHandReport,
      loading: false,
    })
  },

  refreshRevenueTrend: async (days = 7) => {
    const data = await window.api.report.revenueTrend(days)
    set({ revenueTrend: data as RevenueTrendPoint[] })
  },

  refreshSalesTrend: async (opts) => {
    const data = await window.api.report.salesTrend(opts)
    set({ salesTrend: data as SalesTrendReport })
  },

  setDateRange: (from, to) => set({ dateRange: { from, to } }),
}))
