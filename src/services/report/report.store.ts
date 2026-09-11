import { create } from 'zustand'
import type { DailySummary, HourlyBreakdown, ItemPerformance, CategoryPerformance, AddonPerformance, TicketDistribution, OrderTypeSplit, RevenueTrendPoint, PaymentMethodBreakdown } from './report.types'

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
  loading: boolean
  dateRange: { from: string; to: string }
  refreshDashboard: (date?: string) => Promise<void>
  refreshAll: (from?: string, to?: string) => Promise<void>
  refreshRevenueTrend: (days?: number) => Promise<void>
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
    const [summary, hourly, topItems, catRev, addonStats, ticketDist, split, payMethods, invAlerts] = await Promise.all([
      window.api.report.dailySummary(from),
      window.api.report.hourlyBreakdown(from),
      window.api.report.topItems(10, from, to),
      window.api.report.categoryRevenue(from, to),
      window.api.report.addonStats(from, to),
      window.api.report.ticketDistribution(from, to),
      window.api.report.orderTypeSplit(from, to),
      window.api.report.paymentMethodBreakdown(from, to),
      window.api.report.inventoryAlerts(),
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
      loading: false,
    })
  },

  refreshRevenueTrend: async (days = 7) => {
    const data = await window.api.report.revenueTrend(days)
    set({ revenueTrend: data as RevenueTrendPoint[] })
  },

  setDateRange: (from, to) => set({ dateRange: { from, to } }),
}))
