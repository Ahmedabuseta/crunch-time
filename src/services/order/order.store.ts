import { create } from 'zustand'
import type { Order, OrderWithItems, CreateOrderInput, OrderFilters, OrderStatus } from './order.types'

interface OrderStore {
  orders: Order[]
  currentOrder: OrderWithItems | null
  loading: boolean
  fetch: (filters?: OrderFilters) => Promise<void>
  getById: (id: string) => Promise<OrderWithItems | null>
  create: (data: CreateOrderInput) => Promise<string>
  updateStatus: (id: string, status: OrderStatus, reason?: string) => Promise<void>
  /** Assign/change a delivery driver. Cashier-accessible (no admin gate). */
  assignDriver: (orderId: string, profileId: string) => Promise<void>
  delete: (id: string) => Promise<void>
}

export const useOrderStore = create<OrderStore>((set) => ({
  orders: [],
  currentOrder: null,
  loading: false,

  fetch: async (filters?) => {
    set({ loading: true })
    const data = await window.api.order.list(filters)
    set({ orders: data as Order[], loading: false })
  },

  getById: async (id) => {
    const data = await window.api.order.getById(id) as OrderWithItems | null
    set({ currentOrder: data })
    return data
  },

  create: async (data) => {
    const result = await window.api.order.create(data) as { id: string }
    await useOrderStore.getState().fetch()
    return result.id
  },

  updateStatus: async (id, status, reason?) => {
    const result = await window.api.order.updateStatus(id, status, reason) as { ok: boolean; error?: string; refundedAmount?: number }
    if (!result.ok) throw new Error(result.error || 'فشل تحديث حالة الطلب')
    await useOrderStore.getState().fetch()
  },

  assignDriver: async (orderId, profileId) => {
    const result = await window.api.order.assignDriver(orderId, profileId) as { ok: boolean; error?: string; receiptReady?: boolean }
    if (!result.ok) throw new Error(result.error || 'فشل تعيين السائق')
    await useOrderStore.getState().fetch()
  },

  delete: async (id) => {
    const result = await window.api.order.delete(id)
    if (!result.ok) throw new Error(result.error || 'فشل حذف الطلب')
    await useOrderStore.getState().fetch()
  },
}))
