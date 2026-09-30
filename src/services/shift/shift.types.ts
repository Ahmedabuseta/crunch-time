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
  cashDifference: number | null
}
