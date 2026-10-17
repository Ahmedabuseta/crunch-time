export type OrderStatus = 'COMPLETED' | 'CANCELLED' | 'REFUNDED'

export interface Order {
  id: string
  status: OrderStatus
  /** Delivery workflow only: 'unassigned' = no driver yet, 'assigned' = driver set, null = not delivery. */
  driverStatus: 'unassigned' | 'assigned' | null
  orderType: string
  customerName: string | null
  customerPhone: string | null
  customerAddress: string | null
  deliveryAddress: string | null
  deliveryPhone: string | null
  deliveryZoneId: string | null
  deliveryZoneName: string | null
  deliveryNote: string | null
  deliveryProfileId: string | null
  deliveryProfileName: string | null
  note: string | null
  subtotal: number
  tax: number
  deliveryFee: number
  discountCode: string | null
  discountAmount: number
  total: number
  paymentType: string
  cashierName: string | null
  statusReason: string | null
  refundedAmount: number
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
  note: string | null
  selectedModifiersJson: string | null
  selectedAddonsJson: string | null
}

export interface OrderWithItems extends Order {
  items: OrderItem[]
  payments: any[]
}

export interface CreateOrderInput {
  orderType: string
  /** Dine-in only: the table the order is served at. */
  tableNumber?: string
  customerName?: string
  customerPhone?: string
  customerAddress?: string
  deliveryAddress?: string
  deliveryPhone?: string
  deliveryZoneId?: string
  deliveryZoneName?: string
  deliveryNote?: string
  deliveryProfileId?: string
  deliveryProfileName?: string
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
  note?: string
  items: {
    productId: string
    quantity: number
    unitPrice: number
    itemDiscount?: number
    note?: string
    modifiers?: any
    addons?: string[]
  }[]
}

export interface OrderFilters {
  status?: OrderStatus
  orderType?: string
  paymentType?: string
  search?: string
  from?: string
  to?: string
}
