import { create } from 'zustand'
import type { Product, Addon, OrderType } from '@/data/products'

export interface CartItem {
  product: Product
  quantity: number
  addons: Addon[]
}

interface CartStore {
  items: CartItem[]
  orderType: OrderType
  tableNumber: string
  deliveryAddress: string
  deliveryPhone: string
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  addAddonToItem: (productId: string, addon: Addon) => void
  removeAddonFromItem: (productId: string, addonId: string) => void
  setOrderType: (type: OrderType) => void
  setTableNumber: (num: string) => void
  setDeliveryAddress: (addr: string) => void
  setDeliveryPhone: (phone: string) => void
  clearCart: () => void
  subtotal: () => number
  itemCount: () => number
}

export const useCartStore = create<CartStore>((set, get) => ({
  items: [],
  orderType: 'dine-in',
  tableNumber: '',
  deliveryAddress: '',
  deliveryPhone: '',

  addItem: (product) =>
    set((state) => {
      const existing = state.items.find((i) => i.product.id === product.id)
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.product.id === product.id
              ? { ...i, quantity: i.quantity + 1 }
              : i
          ),
        }
      }
      return { items: [...state.items, { product, quantity: 1, addons: [] }] }
    }),

  removeItem: (productId) =>
    set((state) => ({
      items: state.items.filter((i) => i.product.id !== productId),
    })),

  updateQuantity: (productId, quantity) =>
    set((state) => {
      if (quantity <= 0) {
        return { items: state.items.filter((i) => i.product.id !== productId) }
      }
      return {
        items: state.items.map((i) =>
          i.product.id === productId ? { ...i, quantity } : i
        ),
      }
    }),

  addAddonToItem: (productId, addon) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.product.id === productId && !i.addons.find((a) => a.id === addon.id)
          ? { ...i, addons: [...i.addons, addon] }
          : i
      ),
    })),

  removeAddonFromItem: (productId, addonId) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.product.id === productId
          ? { ...i, addons: i.addons.filter((a) => a.id !== addonId) }
          : i
      ),
    })),

  setOrderType: (type) => set({ orderType: type }),
  setTableNumber: (num) => set({ tableNumber: num }),
  setDeliveryAddress: (addr) => set({ deliveryAddress: addr }),
  setDeliveryPhone: (phone) => set({ deliveryPhone: phone }),

  clearCart: () => set({ items: [], tableNumber: '', deliveryAddress: '', deliveryPhone: '' }),

  subtotal: () =>
    get().items.reduce((sum, i) => {
      const addonTotal = i.addons.reduce((as, a) => as + a.price, 0)
      return sum + (i.product.price + addonTotal) * i.quantity
    }, 0),

  itemCount: () =>
    get().items.reduce((sum, i) => sum + i.quantity, 0),
}))
