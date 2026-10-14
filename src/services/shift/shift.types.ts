export interface Shift {
  id: string
  number: number
  userId: string
  startedAt: string
  endedAt: string | null
  openingCash: number
  closingCash: number | null
  status: 'open' | 'closed'
}

export interface OpenShiftInput {
  userId: string
  openingCash: number
}

export interface ShiftReport {
  shiftId: string
  userName: string
  startedAt: string
  endedAt: string | null
  orderCount: number
  totalRevenue: number
  openingCash: number
  closingCash: number | null
  expectedCash: number
  cashDifference: number | null
  payments: { method: string; count: number; total: number }[]
  topItems: { name: string; emoji: string; qty: number; revenue: number }[]
  hourly: { hour: number; orderCount: number; revenue: number }[]
  movements: { type: string; amount: number }[]
}
