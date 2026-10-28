import type { InventoryCategoryId, InventoryStorageId } from '@/lib/inventory-taxonomy'

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
  category: InventoryCategoryId
  storage: InventoryStorageId
  productCount: number
  recipeProductCount: number
  optionalProductCount: number
}

export interface ConsumptionRow {
  ingredientId: string
  name: string
  unit: string
  category: InventoryCategoryId
  storage: InventoryStorageId
  active: boolean
  stock: number
  unitCost: number
  consumed: number
  waste: number
  adjustment: number
  orderCount: number
  cost: number
  wasteCost: number
  avgDaily: number
  daysCover: number | null
  lastConsumedAt: string | null
}

export interface ConsumptionSummary {
  from: string | null
  to: string | null
  days: number | null
  rows: ConsumptionRow[]
  totals: { cost: number; wasteCost: number; ingredients: number }
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
  unitCost?: number | null
  supplier?: string | null
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
  category?: InventoryCategoryId
  storage?: InventoryStorageId
}

export interface UpdateIngredientInput {
  name?: string
  emoji?: string
  unit?: string
  stockQuantity?: number
  minStock?: number
  costPerUnit?: number
  purchaseQty?: number
  category?: InventoryCategoryId
  storage?: InventoryStorageId
}

export interface InventoryAlert extends Ingredient {
  status: 'low' | 'out'
}
