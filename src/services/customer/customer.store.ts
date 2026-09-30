import { create } from 'zustand'
import type { Customer } from '../../ipc/renderer'

interface CustomerStore {
  suggestions: Customer[]
  loading: boolean
  search: (prefix: string) => Promise<void>
  clearSuggestions: () => void
}

let timer: ReturnType<typeof setTimeout> | null = null

export const useCustomerStore = create<CustomerStore>((set) => ({
  suggestions: [],
  loading: false,

  search: async (prefix) => {
    const digits = prefix.replace(/\D/g, '')
    if (digits.length < 3) {
      set({ suggestions: [] })
      return
    }
    if (timer) clearTimeout(timer)
    await new Promise<void>((resolve) => {
      timer = setTimeout(async () => {
        set({ loading: true })
        try {
          const data = await window.api.customer.search(digits)
          set({ suggestions: data, loading: false })
        } catch {
          set({ suggestions: [], loading: false })
        }
        resolve()
      }, 200)
    })
  },

  clearSuggestions: () => {
    if (timer) clearTimeout(timer)
    set({ suggestions: [] })
  },
}))
