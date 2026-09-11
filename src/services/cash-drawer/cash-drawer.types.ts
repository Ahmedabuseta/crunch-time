export type CashMovementType = 'OPENING' | 'SALE' | 'REFUND' | 'CASH_IN' | 'CASH_OUT' | 'CLOSING'

export interface CashMovement {
  id: string
  shiftId: string
  type: CashMovementType
  amount: number
  note: string | null
  createdAt: string
}

export interface CreateCashMovementInput {
  shiftId: string
  type: CashMovementType
  amount: number
  note?: string
}

export interface CashReconciliation {
  openingCash: number
  breakdown: Record<string, number>
  expected: number
  actual: number
  difference: number
}
