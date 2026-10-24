import { create } from 'zustand'
import type { Product, CreateProductInput, UpdateProductInput } from './product.types'

interface ProductStore {
  products: Product[]
  includeInactive: boolean
  loading: boolean
  fetch: (categoryId?: string, includeInactive?: boolean) => Promise<void>
  getById: (id: string) => Promise<Product | null>
  create: (data: CreateProductInput) => Promise<string>
  update: (id: string, data: UpdateProductInput) => Promise<void>
  remove: (id: string, opts?: { hard?: boolean }) => Promise<void>
}

export const useProductStore = create<ProductStore>((set, get) => ({
  products: [],
  includeInactive: false,
  loading: false,

  fetch: async (categoryId?, includeInactive = false) => {
    set({ loading: true })
    const data = await window.api.product.list(categoryId, includeInactive)
    set({ products: data as Product[], includeInactive, loading: false })
  },

  getById: async (id) => {
    return await window.api.product.getById(id) as Product | null
  },

  create: async (data) => {
    const result = await window.api.product.create(data) as { id: string }
    await get().fetch(undefined, get().includeInactive)
    return result.id
  },

  update: async (id, data) => {
    await window.api.product.update(id, data)
    await get().fetch(undefined, get().includeInactive)
  },

  remove: async (id, opts) => {
    const result = await window.api.product.delete(id, opts) as { ok: boolean; error?: string }
    if (!result.ok) throw new Error(result.error || 'فشل حذف المنتج')
    await get().fetch(undefined, get().includeInactive)
  },
}))
