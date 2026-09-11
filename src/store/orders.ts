import { create } from 'zustand'
import type { CartItem } from './cart'
import type { OrderType } from '@/data/products'
import { generateSeedOrders } from '@/data/seedOrders'

export type OrderStatus = 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled'

export interface Order {
  id: string
  items: CartItem[]
  total: number
  createdAt: Date
  status: OrderStatus
  orderType: OrderType
  tableNumber: string
  deliveryAddress: string
  deliveryPhone: string
}

interface OrdersStore {
  orders: Order[]
  addOrder: (items: CartItem[], total: number, orderType: OrderType, tableNumber: string, deliveryAddress: string, deliveryPhone: string) => void
  updateStatus: (orderId: string, status: OrderStatus) => void
  deleteOrder: (orderId: string) => void
}

export const useOrdersStore = create<OrdersStore>((set) => ({
  orders: generateSeedOrders(),

  addOrder: (items, total, orderType, tableNumber, deliveryAddress, deliveryPhone) =>
    set((state) => ({
      orders: [
        {
          id: `#${Date.now().toString().slice(-6)}`,
          items,
          total,
          createdAt: new Date(),
          status: 'pending' as OrderStatus,
          orderType,
          tableNumber,
          deliveryAddress,
          deliveryPhone,
        },
        ...state.orders,
      ],
    })),

  updateStatus: (orderId, status) =>
    set((state) => ({
      orders: state.orders.map((o) =>
        o.id === orderId ? { ...o, status } : o
      ),
    })),

  deleteOrder: (orderId) =>
    set((state) => ({
      orders: state.orders.filter((o) => o.id !== orderId),
    })),
}))
