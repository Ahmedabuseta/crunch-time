export interface Payment {
  id: string
  orderId: string
  method: 'cash' | 'card' | 'wallet'
  amount: number
  reference: string | null
  createdAt: string
}

export interface CreatePaymentInput {
  orderId: string
  method: 'cash' | 'card' | 'wallet'
  amount: number
  reference?: string
}
