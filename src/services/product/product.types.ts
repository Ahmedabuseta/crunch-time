export interface Product {
  id: string
  name: string
  price: number
  costPrice: number
  categoryId: string
  emoji: string
  description: string
  active: boolean
}

export interface CreateProductInput {
  name: string
  price: number
  costPrice?: number
  categoryId: string
  emoji: string
  description: string
}

export interface UpdateProductInput {
  name?: string
  price?: number
  costPrice?: number
  categoryId?: string
  emoji?: string
  description?: string
  active?: boolean
}
