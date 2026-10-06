export interface DailySummary {
  date: string
  totalOrders: number
  totalRevenue: number
  avgOrderValue: number
  cancelledOrders: number
  cancellationRate: number
  refundedOrders?: number
  totalRefunded?: number
  costOfGoods?: number
  grossProfit?: number
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
  takeaway: { count: number; revenue: number; percentage: number }
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

// ─── Market-resilience analytics ───────────────────────────────
export type AbcClass = 'A' | 'B' | 'C'
export type XyzClass = 'X' | 'Y' | 'Z'

export interface AbcXyzRow {
  productId: string
  name: string
  emoji: string
  revenue: number
  qty: number
  share: number
  cumShare: number
  abc: AbcClass
  xyz: XyzClass
  cv: number
}

export interface AbcXyzReport {
  from: string | null
  to: string | null
  totalRevenue: number
  totalProducts: number
  products: AbcXyzRow[]
  matrixCounts: Record<string, number>
  policies: Record<string, string>
}

export interface InventoryTurnoverRow {
  ingredientId: string
  name: string
  unit: string
  supplier: string | null
  unitCost: number
  consumptionUnits: number
  cogsPeriod: number
  stockStart: number
  stockEnd: number
  avgStockUnits: number
  avgStockValue: number
  stockValueCurrent: number
  turnover: number
}

export interface InventoryTurnoverReport {
  from: string | null
  to: string | null
  rows: InventoryTurnoverRow[]
  totalCogs: number
  totalAvgStockValue: number
  weightedTurnover: number
}

export interface SupplierConcentrationRow {
  supplier: string
  qty: number
  spend: number
  share: number
}

export interface PpvRow {
  ingredientId: string
  name: string
  unit: string
  plannedCost: number
  currentCost: number
  standardCost: number
  purchases: number
  qty: number
  spend: number
  lastCost: number
  lastDate: string | null
  lastSupplier: string | null
  avgCost: number
  ppv: number
  ppvPct: number
  concentration: SupplierConcentrationRow[]
  topSupplierPct: number
  singleSupplierConcentration: boolean
}

export interface PpvReport {
  from: string | null
  to: string | null
  rows: PpvRow[]
  totalSpend: number
  totalPPV: number
  totalPurchases: number
  highConcentrationCount: number
}

export interface SalesTrendReport {
  days: number
  forecastDays: number
  historical: RevenueTrendPoint[]
  forecast: { date: string; revenue: number; factor: number }[]
  baseDailyRevenue: number
  avgDailyRevenue30: number
  avgDailyRevenue60: number
  avgDailyRevenue90: number
  weekdayFactors: { weekday: number; avg: number; factor: number }[]
  items: { productId: string; name: string; emoji: string; baseDailyQty: number; last7Qty: number; trend: number; forecast30d: number; value30d: number }[]
}

/** One row of the end-of-day delivery settlement: COD cash the driver hands over. */
export interface DriverSummaryBucket {
  profileId: string | null
  name: string
  phone: string | null
  active: boolean
  orderCount: number
  cashTotal: number
  visaTotal: number
  deliveryFee: number
  total: number
}

export interface DriverSummary {
  from: string
  to: string
  drivers: DriverSummaryBucket[]
  unassigned: DriverSummaryBucket
  totals: {
    orderCount: number
    cashTotal: number
    visaTotal: number
    deliveryFee: number
    total: number
  }
}

export interface DaysOnHandRow {
  ingredientId: string
  name: string
  unit: string
  supplier: string | null
  secondarySupplier: string | null
  supplierRatio: number
  plannedCost: number
  stock: number
  minStock: number
  unitCost: number
  stockValue: number
  avgDailyUse: number
  dio: number | null
  status: 'ok' | 'low' | 'critical'
}

export interface DaysOnHandReport {
  rows: DaysOnHandRow[]
  concentrations: { ingredientId: string; rows: SupplierConcentrationRow[]; topSupplierPct: number; singleSupplierConcentration: boolean }[]
}
