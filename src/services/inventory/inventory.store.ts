import { create } from 'zustand'
import type { Ingredient, CreateIngredientInput, UpdateIngredientInput, Recipe, InventoryAlert } from './inventory.types'

interface InventoryStore {
  ingredients: Ingredient[]
  alerts: InventoryAlert[]
  loading: boolean
  fetchIngredients: () => Promise<void>
  fetchAlerts: () => Promise<void>
  createIngredient: (data: CreateIngredientInput) => Promise<string>
  updateIngredient: (id: string, data: UpdateIngredientInput) => Promise<void>
  removeIngredient: (id: string) => Promise<void>
  restock: (ingredientId: string, qty: number, note?: string) => Promise<void>
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

  removeIngredient: async (id) => {
    await window.api.inventory.deleteIngredient(id)
    await get().fetchIngredients()
  },

  restock: async (ingredientId, qty, note?) => {
    await window.api.inventory.restock(ingredientId, qty, note)
    await get().fetchIngredients()
    await get().fetchAlerts()
  },

  fetchRecipes: async (productId) => {
    return await window.api.inventory.listRecipes(productId) as Recipe[]
  },

  upsertRecipe: async (data) => {
    const result = await window.api.inventory.upsertRecipe(data) as { id: string }
    return result.id
  },

  deleteRecipe: async (id) => {
    await window.api.inventory.deleteRecipe(id)
  },

  deductForOrder: async (orderId) => {
    await window.api.inventory.deductForOrder(orderId)
    await get().fetchAlerts()
  },

  dismissAlerts: () => set({ alertsDismissed: true }),
}))
