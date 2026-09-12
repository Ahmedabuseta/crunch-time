export interface Ingredient {
  id: string
  name: string
  emoji: string
  unit: 'g' | 'ml' | 'pcs' | 'kg' | 'l'
  stockQuantity: number
  minStock: number
  costPerUnit: number
  active: boolean
}

export interface Recipe {
  id: string
  productId: string
  ingredientId: string
  quantityPerUnit: number
}

export interface InventoryTransaction {
  id: string
  ingredientId: string
  type: 'PURCHASE' | 'CONSUMPTION' | 'ADJUSTMENT' | 'WASTE'
  quantity: number
  referenceOrderId: string | null
  note: string | null
  createdAt: string
}

export interface CreateIngredientInput {
  name: string
  emoji?: string
  unit: string
  stockQuantity?: number
  minStock?: number
  costPerUnit?: number
}

export interface UpdateIngredientInput {
  name?: string
  emoji?: string
  unit?: string
  stockQuantity?: number
  minStock?: number
  costPerUnit?: number
}

export interface InventoryAlert extends Ingredient {
  status: 'low' | 'out'
}
