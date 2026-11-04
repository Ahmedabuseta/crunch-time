export interface Product {
  id: string
  name: string
  price: number
  costPrice: number
  categoryId: string
  emoji: string
  description: string
  active: boolean
  addonCount?: number
  modifierCount?: number
  recipeCount?: number
}

export interface CreateProductInput {
  name: string
  price: number
  costPrice?: number
  categoryId: string
  emoji: string
  description: string
  active?: boolean
}

export interface UpdateProductInput {
  name?: string
  price?: number
  costPrice?: number
  categoryId?: string
  emoji?: string
  description?: string
  active?: boolean
  supportsRollback?: boolean
}
