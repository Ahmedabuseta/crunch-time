import type { Product } from '../product/product.types'
import type { Addon } from '../addon/addon.types'

export interface CartItemModifier {
  groupId: string
  groupName: string
  modifierId: string
  modifierName: string
  priceAdjustment: number
}

export interface CartItemAddon extends Addon {
  qty: number
}

export interface CartItem {
  lineId: string
  product: Product
  quantity: number
  addons: CartItemAddon[]
  modifiers: CartItemModifier[]
  note: string
}

export interface OrderType {
  type: 'delivery' | 'dine-in'
  tableNumber?: string
  deliveryAddress?: string
  deliveryPhone?: string
}
