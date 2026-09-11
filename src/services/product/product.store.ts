import { create } from 'zustand'
import type { Product, CreateProductInput, UpdateProductInput } from './product.types'

interface ProductStore {
  products: Product[]
  loading: boolean
  fetch: (categoryId?: string) => Promise<void>
  getById: (id: string) => Promise<Product | null>
  create: (data: CreateProductInput) => Promise<string>
  update: (id: string, data: UpdateProductInput) => Promise<void>
  remove: (id: string) => Promise<void>
}

export const useProductStore = create<ProductStore>((set) => ({
  products: [],
  loading: false,

  fetch: async (categoryId?) => {
    set({ loading: true })
    const data = await window.api.product.list(categoryId)
    set({ products: data as Product[], loading: false })
  },

  getById: async (id) => {
    return await window.api.product.getById(id) as Product | null
  },

  create: async (data) => {
    const result = await window.api.product.create(data) as { id: string }
    await useProductStore.getState().fetch()
    return result.id
  },

  update: async (id, data) => {
    await window.api.product.update(id, data)
    await useProductStore.getState().fetch()
  },

  remove: async (id) => {
    await window.api.product.delete(id)
    await useProductStore.getState().fetch()
  },
}))
