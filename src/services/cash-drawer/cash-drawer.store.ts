import { create } from 'zustand'
import type { CashMovement, CreateCashMovementInput, CashReconciliation } from './cash-drawer.types'

interface CashDrawerStore {
  movements: CashMovement[]
  reconciliation: CashReconciliation | null
  loading: boolean
  fetchByShift: (shiftId: string) => Promise<void>
  addMovement: (data: CreateCashMovementInput) => Promise<string>
  reconcile: (shiftId: string) => Promise<void>
}

export const useCashDrawerStore = create<CashDrawerStore>((set) => ({
  movements: [],
  reconciliation: null,
  loading: false,

  fetchByShift: async (shiftId) => {
    set({ loading: true })
    const data = await window.api.cashDrawer.listByShift(shiftId)
    set({ movements: data as CashMovement[], loading: false })
  },

  addMovement: async (data) => {
    const result = await window.api.cashDrawer.addMovement(data) as { id: string }
    if (data.shiftId) await useCashDrawerStore.getState().fetchByShift(data.shiftId)
    return result.id
  },

  reconcile: async (shiftId) => {
    const data = await window.api.cashDrawer.reconcile(shiftId)
    set({ reconciliation: data as CashReconciliation | null })
  },
}))
