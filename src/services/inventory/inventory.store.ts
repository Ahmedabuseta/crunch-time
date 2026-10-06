import { create } from 'zustand'
import type { Ingredient, CreateIngredientInput, UpdateIngredientInput, Recipe, InventoryAlert, InventoryLedger } from './inventory.types'

interface InventoryStore {
  ingredients: Ingredient[]
  alerts: InventoryAlert[]
  loading: boolean
  fetchIngredients: () => Promise<void>
  fetchAlerts: () => Promise<void>
  createIngredient: (data: CreateIngredientInput) => Promise<string>
  updateIngredient: (id: string, data: UpdateIngredientInput) => Promise<void>
  removeIngredient: (id: string, opts?: { hard?: boolean }) => Promise<void>
  restock: (ingredientId: string, qty: number, note?: string, opts?: { unitCost?: number; supplier?: string }) => Promise<{ ok: boolean; ppv?: number }>
  recordWaste: (ingredientId: string, qty: number, note?: string) => Promise<void>
  adjust: (ingredientId: string, delta: number, note?: string) => Promise<void>
  fetchLedger: (ingredientId: string, filters?: { type?: string; from?: string; to?: string; page?: number; pageSize?: number }) => Promise<InventoryLedger & { total: number; page: number; pageSize: number; totalPages: number }>
  fetchRecipes: (productId: string) => Promise<Recipe[]>
  upsertRecipe: (data: any) => Promise<string>
  deleteRecipe: (id: string) => Promise<void>
  deductForOrder: (orderId: string) => Promise<void>
  alertsDismissed: boolean
  dismissAlerts: () => void
}

export const useInventoryStore = create<InventoryStore>((set, get) => ({
  ingredients: [],
  alerts: [],
  loading: false,
  alertsDismissed: false,

  fetchIngredients: async () => {
    set({ loading: true })
    const data = await window.api.inventory.listIngredients()
    set({ ingredients: data as Ingredient[], loading: false })
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

  fetchLedger: async (ingredientId, filters?) => {
    return await window.api.inventory.listTransactions(ingredientId, filters) as InventoryLedger & { total: number; page: number; pageSize: number; totalPages: number }
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
