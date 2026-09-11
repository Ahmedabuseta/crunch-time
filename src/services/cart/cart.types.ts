import type { Product } from '../product/product.types'
import type { Addon } from '../addon/addon.types'

export interface CartItemModifier {
  groupId: string
  groupName: string
  modifierId: string
  modifierName: string
  priceAdjustment: number
}

export interface CartItem {
  product: Product
  quantity: number
  addons: Addon[]
  modifiers: CartItemModifier[]
}

export interface OrderType {
  type: 'delivery' | 'dine-in'
  tableNumber?: string
  deliveryAddress?: string
  deliveryPhone?: string
}
