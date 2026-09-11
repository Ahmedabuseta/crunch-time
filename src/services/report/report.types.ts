export interface DailySummary {
  date: string
  totalOrders: number
  totalRevenue: number
  avgOrderValue: number
  cancelledOrders: number
  cancellationRate: number
}

export interface HourlyBreakdown {
  hour: number
  orderCount: number
  revenue: number
}

export interface ItemPerformance {
  name: string
  emoji: string
  totalQuantity: number
  totalRevenue: number
}

export interface CategoryPerformance {
  categoryId: string
  name: string
  totalRevenue: number
}

export interface AddonPerformance {
  name: string
  emoji: string
  totalQuantity: number
  totalRevenue: number
}

export interface TicketDistribution {
  range: string
  count: number
  percentage: number
}

export interface OrderTypeSplit {
  delivery: { count: number; revenue: number; percentage: number }
  dineIn: { count: number; revenue: number; percentage: number }
}

export interface RevenueTrendPoint {
  date: string
  revenue: number
  orderCount: number
}

export interface PaymentMethodBreakdown {
  method: string
  count: number
  total: number
}
