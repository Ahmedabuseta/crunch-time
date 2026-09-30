import { create } from 'zustand'
import type { Shift, OpenShiftInput, ShiftReport } from './shift.types'

interface ShiftFilters {
  userId?: string
  from?: string
  to?: string
}

interface ShiftStore {
  currentShift: Shift | null
  shifts: Shift[]
  loading: boolean
  fetchCurrent: () => Promise<void>
  fetch: (filters?: ShiftFilters) => Promise<void>
  open: (data: OpenShiftInput) => Promise<string>
  close: (id: string, closingCash: number) => Promise<void>
  getReport: (shiftId: string) => Promise<ShiftReport | null>
}

export const useShiftStore = create<ShiftStore>((set) => ({
  currentShift: null,
  shifts: [],
  loading: false,

  fetchCurrent: async () => {
    const data = await window.api.shift.getCurrent()
    set({ currentShift: data as Shift | null })
  },

  fetch: async (filters?) => {
    set({ loading: true })
    const data = await window.api.shift.list(filters && Object.keys(filters).length > 0 ? filters : undefined)
    set({ shifts: data as Shift[], loading: false })
  },

  open: async (data) => {
    const result = await window.api.shift.open(data) as { id?: string; error?: string }
    if (result.error) throw new Error(result.error)
    await useShiftStore.getState().fetchCurrent()
    return result.id!
  },

  close: async (id, closingCash) => {
    await window.api.shift.close(id, closingCash)
    await useShiftStore.getState().fetchCurrent()
    await useShiftStore.getState().fetch()
  },

  getReport: async (shiftId) => {
    return await window.api.report.shiftReport(shiftId) as ShiftReport | null
  },
}))
