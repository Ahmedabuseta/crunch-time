import { create } from 'zustand'
import type { CartItem, CartItemModifier, CartItemAddon } from './cart.types'
import type { Product } from '../product/product.types'
import type { Addon } from '../addon/addon.types'

const makeLineId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

const sameModifiers = (a: CartItemModifier[], b: CartItemModifier[]) => {
  if (a.length !== b.length) return false
  const ka = [...a].map(m => m.modifierId).sort().join(',')
  const kb = [...b].map(m => m.modifierId).sort().join(',')
  return ka === kb
}

interface CartStore {
  items: CartItem[]
  orderType: 'delivery' | 'dine-in'
  tableNumber: string
  deliveryAddress: string
  deliveryPhone: string
  customerName: string
  paymentType: 'cash' | 'visa'
  discountCode: string
  orderNote: string
  deliveryZoneId: string
  deliveryNote: string
  addItem: (product: Product, modifiers?: CartItemModifier[]) => string
  removeItem: (lineId: string) => void
  updateQuantity: (lineId: string, quantity: number) => void
  setItemNote: (lineId: string, note: string) => void
  setOrderNote: (note: string) => void
  addAddon: (lineId: string, addon: Addon) => void
  updateAddonQty: (lineId: string, addonId: string, qty: number) => void
  removeAddon: (lineId: string, addonId: string) => void
  setOrderType: (type: 'delivery' | 'dine-in') => void
  setTableNumber: (num: string) => void
  setDeliveryAddress: (addr: string) => void
  setDeliveryPhone: (phone: string) => void
  setCustomerName: (name: string) => void
  setPaymentType: (type: 'cash' | 'visa') => void
  setDiscountCode: (code: string) => void
  setDeliveryZoneId: (id: string) => void
  setDeliveryNote: (note: string) => void
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
  orderNote: '',
  deliveryZoneId: '',
  deliveryNote: '',

  addItem: (product, modifiers = []) => {
    const state = get()
    const existing = state.items.find((i) =>
      i.product.id === product.id && sameModifiers(i.modifiers, modifiers) && i.addons.length === 0 && !i.note)
    if (existing) {
      set({ items: state.items.map((i) => i.lineId === existing.lineId ? { ...i, quantity: i.quantity + 1 } : i) })
      return existing.lineId
    }
    const lineId = makeLineId()
    set({ items: [...state.items, { lineId, product, quantity: 1, addons: [], modifiers, note: '' }] })
    return lineId
  },

  removeItem: (lineId) =>
    set((state) => ({ items: state.items.filter((i) => i.lineId !== lineId) })),

  updateQuantity: (lineId, quantity) =>
    set((state) => {
      if (quantity <= 0) return { items: state.items.filter((i) => i.lineId !== lineId) }
      return { items: state.items.map((i) => i.lineId === lineId ? { ...i, quantity } : i) }
    }),

  setItemNote: (lineId, note) =>
    set((state) => ({ items: state.items.map((i) => i.lineId === lineId ? { ...i, note } : i) })),

  setOrderNote: (note) => set({ orderNote: note }),

  addAddon: (lineId, addon) =>
    set((state) => ({
      items: state.items.map((i) => {
        if (i.lineId !== lineId) return i
        const existing = i.addons.find((a) => a.id === addon.id)
        if (existing) {
          return { ...i, addons: i.addons.map((a) => a.id === addon.id ? { ...a, qty: a.qty + 1 } : a) }
        }
        return { ...i, addons: [...i.addons, { ...addon, qty: 1 } as CartItemAddon] }
      }),
    })),

  updateAddonQty: (lineId, addonId, qty) =>
    set((state) => ({
      items: state.items.map((i) => {
        if (i.lineId !== lineId) return i
        if (qty <= 0) return { ...i, addons: i.addons.filter((a) => a.id !== addonId) }
        return { ...i, addons: i.addons.map((a) => a.id === addonId ? { ...a, qty } : a) }
      }),
    })),

  removeAddon: (lineId, _addonId) =>
    set((state) => ({
      items: state.items.map((i) => {
        if (i.lineId !== lineId) return i
        return { ...i, addons: i.addons.filter((a: any) => a._uid !== _addonId && a.id !== _addonId) }
      }),
    })),

  setOrderType: (type) => set({ orderType: type }),
  setTableNumber: (num) => set({ tableNumber: num }),
  setDeliveryAddress: (addr) => set({ deliveryAddress: addr }),
  setDeliveryPhone: (phone) => set({ deliveryPhone: phone }),
  setCustomerName: (name) => set({ customerName: name }),
  setPaymentType: (type) => set({ paymentType: type }),
  setDiscountCode: (code) => set({ discountCode: code }),
  setDeliveryZoneId: (id) => set({ deliveryZoneId: id }),
  setDeliveryNote: (note) => set({ deliveryNote: note }),

  clearCart: () => set({ items: [], tableNumber: '', deliveryAddress: '', deliveryPhone: '', customerName: '', discountCode: '', orderNote: '', deliveryZoneId: '', deliveryNote: '' }),

  subtotal: () => get().items.reduce((sum, i) => {
    const addonTotal = i.addons.reduce((s, a) => s + a.price * (a.qty || 1), 0)
    const modifierTotal = i.modifiers.reduce((s, m) => s + m.priceAdjustment, 0)
    return sum + (i.product.price + addonTotal + modifierTotal) * i.quantity
  }, 0),

  itemCount: () => get().items.reduce((sum, i) => sum + i.quantity, 0),
}))
