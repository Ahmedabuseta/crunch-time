import { create } from 'zustand'
import type { Payment, CreatePaymentInput } from './payment.types'

interface PaymentStore {
  payments: Payment[]
  fetchByOrder: (orderId: string) => Promise<void>
  create: (data: CreatePaymentInput) => Promise<string>
  getTotalPaid: (orderId: string) => Promise<number>
}

export const usePaymentStore = create<PaymentStore>((set) => ({
  payments: [],

  fetchByOrder: async (orderId) => {
    const data = await window.api.payment.listByOrder(orderId)
    set({ payments: data as Payment[] })
  },

  create: async (data) => {
    const result = await window.api.payment.create(data) as { id: string }
    return result.id
  },

  getTotalPaid: async (orderId) => {
    return await window.api.payment.getTotalPaid(orderId) as number
  },
}))
