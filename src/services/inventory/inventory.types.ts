export interface Ingredient {
  id: string
  name: string
  emoji: string
  unit: 'g' | 'ml' | 'pcs' | 'kg' | 'l'
  stockQuantity: number
  minStock: number
  costPerUnit: number
  purchaseQty: number
  active: boolean
  supplier: string | null
  secondarySupplier: string | null
  supplierRatio: number
  plannedCost: number
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

export interface InventoryMovement extends InventoryTransaction {
  balance: number
}

export interface InventoryLedger {
  ingredient: Ingredient | null
  currentStock: number
  openingBalance: number
  movements: InventoryMovement[]
}

export interface CreateIngredientInput {
  name: string
  emoji?: string
  unit: string
  stockQuantity?: number
  minStock?: number
  costPerUnit?: number
  purchaseQty?: number
}

export interface UpdateIngredientInput {
  name?: string
  emoji?: string
  unit?: string
  stockQuantity?: number
  minStock?: number
  costPerUnit?: number
  purchaseQty?: number
}

export interface InventoryAlert extends Ingredient {
  status: 'low' | 'out'
}
