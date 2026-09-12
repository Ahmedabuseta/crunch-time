export type OrderStatus = 'DRAFT' | 'PENDING_PAYMENT' | 'PAID' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED' | 'REFUNDED'

export interface Order {
  id: string
  status: OrderStatus
  orderType: string
  tableNumber: string | null
  deliveryAddress: string | null
  deliveryPhone: string | null
  subtotal: number
  tax: number
  deliveryFee: number
  total: number
  userId: string | null
  shiftId: string | null
  createdAt: string
  updatedAt: string
}

export interface OrderItem {
  id: string
  orderId: string
  productId: string
  quantity: number
  unitPrice: number
  selectedModifiersJson: string | null
  selectedAddonsJson: string | null
}

export interface OrderWithItems extends Order {
  items: OrderItem[]
  payments: any[]
}

export interface CreateOrderInput {
  orderType: string
  tableNumber?: string
  customerName?: string
  customerPhone?: string
  customerAddress?: string
  deliveryAddress?: string
  deliveryPhone?: string
  subtotal: number
  tax: number
  deliveryFee: number
  total: number
  paymentType?: string
  cashierName?: string
  discountCode?: string
  discountAmount?: number
  discountCodeId?: string
  userId?: string
  shiftId?: string
  items: {
    productId: string
    quantity: number
    unitPrice: number
    itemDiscount?: number
    modifiers?: any
    addons?: string[]
  }[]
}

export interface OrderFilters {
  status?: OrderStatus
  orderType?: string
  from?: string
  to?: string
}
