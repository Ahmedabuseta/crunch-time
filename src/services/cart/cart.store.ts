import { create } from 'zustand'
import type { CartItem, CartItemModifier } from './cart.types'
import type { Product } from '../product/product.types'
import type { Addon } from '../addon/addon.types'

interface CartStore {
  items: CartItem[]
  orderType: 'delivery' | 'dine-in'
  tableNumber: string
  deliveryAddress: string
  deliveryPhone: string
  customerName: string
  paymentType: 'cash' | 'visa'
  discountCode: string
  addItem: (product: Product) => void
  removeItem: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  addAddon: (productId: string, addon: Addon) => void
  removeAddon: (productId: string, addonId: string) => void
  setModifiers: (productId: string, modifiers: CartItemModifier[]) => void
  setOrderType: (type: 'delivery' | 'dine-in') => void
  setTableNumber: (num: string) => void
  setDeliveryAddress: (addr: string) => void
  setDeliveryPhone: (phone: string) => void
  setCustomerName: (name: string) => void
  setPaymentType: (type: 'cash' | 'visa') => void
  setDiscountCode: (code: string) => void
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
  customerName: '',
  paymentType: 'cash',
  discountCode: '',

  addItem: (product) =>
    set((state) => {
      const existing = state.items.find((i) => i.product.id === product.id)
      if (existing) {
        return { items: state.items.map((i) => i.product.id === product.id ? { ...i, quantity: i.quantity + 1 } : i) }
      }
      return { items: [...state.items, { product, quantity: 1, addons: [], modifiers: [] }] }
    }),

  removeItem: (productId) =>
    set((state) => ({ items: state.items.filter((i) => i.product.id !== productId) })),

  updateQuantity: (productId, quantity) =>
    set((state) => {
      if (quantity <= 0) return { items: state.items.filter((i) => i.product.id !== productId) }
      return { items: state.items.map((i) => i.product.id === productId ? { ...i, quantity } : i) }
    }),

  addAddon: (productId, addon) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.product.id === productId
          ? { ...i, addons: [...i.addons, { ...addon, _uid: Date.now() + Math.random() }] } : i
      ),
    })),

  removeAddon: (productId, _addonId) =>
    set((state) => ({
      items: state.items.map((i) => {
        if (i.product.id !== productId) return i
        const idx = i.addons.findIndex((a: any) => a._uid === _addonId || a.id === _addonId)
        if (idx === -1) return i
        const newAddons = [...i.addons]
        newAddons.splice(idx, 1)
        return { ...i, addons: newAddons }
      }),
    })),

  setModifiers: (productId, modifiers) =>
    set((state) => ({
      items: state.items.map((i) =>
        i.product.id === productId ? { ...i, modifiers } : i
      ),
    })),

  setOrderType: (type) => set({ orderType: type }),
  setTableNumber: (num) => set({ tableNumber: num }),
  setDeliveryAddress: (addr) => set({ deliveryAddress: addr }),
  setDeliveryPhone: (phone) => set({ deliveryPhone: phone }),
  setCustomerName: (name) => set({ customerName: name }),
  setPaymentType: (type) => set({ paymentType: type }),
  setDiscountCode: (code) => set({ discountCode: code }),

  clearCart: () => set({ items: [], tableNumber: '', deliveryAddress: '', deliveryPhone: '', customerName: '', discountCode: '' }),

  subtotal: () => get().items.reduce((sum, i) => {
    const addonTotal = i.addons.reduce((s, a) => s + a.price, 0)
    const modifierTotal = i.modifiers.reduce((s, m) => s + m.priceAdjustment, 0)
    return sum + (i.product.price + addonTotal + modifierTotal) * i.quantity
  }, 0),

  itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
}))
