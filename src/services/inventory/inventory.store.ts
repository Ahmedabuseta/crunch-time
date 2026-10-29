import { create } from 'zustand'
import type { Ingredient, CreateIngredientInput, UpdateIngredientInput, Recipe, InventoryAlert, InventoryLedger, ConsumptionSummary } from './inventory.types'

interface InventoryStore {
  ingredients: Ingredient[]
  allIngredients: Ingredient[]
  alerts: InventoryAlert[]
  loading: boolean
  fetchIngredients: () => Promise<void>
  fetchAlerts: () => Promise<void>
  createIngredient: (data: CreateIngredientInput) => Promise<string>
  updateIngredient: (id: string, data: UpdateIngredientInput) => Promise<void>
  removeIngredient: (id: string, opts?: { hard?: boolean }) => Promise<void>
  setIngredientActive: (id: string, active: boolean) => Promise<void>
  restock: (ingredientId: string, qty: number, note?: string, opts?: { unitCost?: number; packagePrice?: number; totalPrice?: number; supplier?: string; byQuantity?: boolean }) => Promise<{ ok: boolean; ppv?: number }>
  recordWaste: (ingredientId: string, qty: number, note?: string) => Promise<void>
  adjust: (ingredientId: string, delta: number, note?: string) => Promise<void>
  exchange: (input: { fromIngredientId: string; fromPackages: number; toIngredientId: string; toPackages: number; packagePrice?: number; supplier?: string; note?: string }) => Promise<{ ok: boolean; ppv?: number; error?: string }>
  fetchLedger: (ingredientId: string, filters?: { type?: string; from?: string; to?: string; page?: number; pageSize?: number }) => Promise<InventoryLedger & { total: number; page: number; pageSize: number; totalPages: number }>
  fetchConsumption: (from?: string, to?: string) => Promise<ConsumptionSummary>
  fetchRecipes: (productId: string) => Promise<Recipe[]>
  upsertRecipe: (data: any) => Promise<string>
  deleteRecipe: (id: string) => Promise<void>
  deductForOrder: (orderId: string) => Promise<void>
  alertsDismissed: boolean
  dismissAlerts: () => void
}

export const useInventoryStore = create<InventoryStore>((set, get) => ({
  ingredients: [],
  allIngredients: [],
  alerts: [],
  loading: false,
  alertsDismissed: false,

  fetchIngredients: async () => {
    set({ loading: true })
    const data = await window.api.inventory.listIngredients({ includeInactive: true }) as Ingredient[]
    set({ allIngredients: data, ingredients: data.filter((i) => i.active), loading: false })
  },

  fetchAlerts: async () => {
    const data = await window.api.inventory.getAlerts()
    const alerts: InventoryAlert[] = (data as Ingredient[]).map(i => ({
      ...i,
      status: i.stockQuantity <= 0 ? 'out' as const : 'low' as const,
    }))
    set({ alerts })
  },

  createIngredient: async (data) => {
    const result = await window.api.inventory.createIngredient(data) as { id: string }
    await get().fetchIngredients()
    await get().fetchAlerts()
    return result.id
  },

  updateIngredient: async (id, data) => {
    await window.api.inventory.updateIngredient(id, data)
    await get().fetchIngredients()
    await get().fetchAlerts()
  },

  removeIngredient: async (id, opts) => {
    const result = await window.api.inventory.deleteIngredient(id, opts) as { ok: boolean; error?: string }
    if (!result.ok) throw new Error(result.error || 'فشل تعطيل المادة')
    await get().fetchIngredients()
    await get().fetchAlerts()
  },

  setIngredientActive: async (id, active) => {
    const result = await window.api.inventory.setIngredientActive(id, active) as { ok: boolean; error?: string }
    if (!result.ok) throw new Error(result.error || 'فشل تحديث حالة المادة')
    await get().fetchIngredients()
    await get().fetchAlerts()
  },

restock: async (ingredientId, qty, note?, opts?) => {
    const result = await window.api.inventory.restock(ingredientId, qty, note, opts) as { ok: boolean; ppv?: number }
    await get().fetchIngredients()
    return result
  },

  recordWaste: async (ingredientId, qty, note?) => {
    await window.api.inventory.recordWaste(ingredientId, qty, note)
    await get().fetchIngredients()
    await get().fetchAlerts()
  },

  adjust: async (ingredientId, delta, note?) => {
    await window.api.inventory.adjust(ingredientId, delta, note)
    await get().fetchIngredients()
    await get().fetchAlerts()
  },

  exchange: async (input) => {
    const result = await window.api.inventory.exchange(input) as { ok: boolean; ppv?: number; error?: string }
    await get().fetchIngredients()
    await get().fetchAlerts()
    return result
  },

  fetchLedger: async (ingredientId, filters?) => {
    return await window.api.inventory.listTransactions(ingredientId, filters) as InventoryLedger & { total: number; page: number; pageSize: number; totalPages: number }
  },

  fetchConsumption: async (from?, to?) => {
    return await window.api.inventory.consumptionSummary({ from, to }) as ConsumptionSummary
  },

  fetchRecipes: async (productId) => {
    return await window.api.inventory.listRecipes(productId) as Recipe[]
  },

  upsertRecipe: async (data) => {
    const result = await window.api.inventory.upsertRecipe(data) as { id: string }
    return result.id
  },

  deleteRecipe: async (id) => {
    const result = await window.api.inventory.deleteRecipe(id) as { ok: boolean; error?: string }
    if (!result.ok) throw new Error(result.error || 'فشل حذف الوصفة')
  },

  deductForOrder: async (orderId) => {
    await window.api.inventory.deductForOrder(orderId)
    await get().fetchAlerts()
  },

  dismissAlerts: () => set({ alertsDismissed: true }),
}))
