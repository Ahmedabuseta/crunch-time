import { create } from 'zustand'
import type { Category, CreateCategoryInput, UpdateCategoryInput } from './category.types'

interface CategoryStore {
  categories: Category[]
  loading: boolean
  fetch: () => Promise<void>
  create: (data: CreateCategoryInput) => Promise<string>
  update: (id: string, data: UpdateCategoryInput) => Promise<void>
  remove: (id: string) => Promise<void>
  reorder: (ids: string[]) => Promise<void>
}

export const useCategoryStore = create<CategoryStore>((set) => ({
  categories: [],
  loading: false,

  fetch: async () => {
    set({ loading: true })
    const data = await window.api.category.list()
    set({ categories: data as Category[], loading: false })
  },

  create: async (data) => {
    const result = await window.api.category.create(data) as { id: string }
    await useCategoryStore.getState().fetch()
    return result.id
  },

  update: async (id, data) => {
    await window.api.category.update(id, data)
    await useCategoryStore.getState().fetch()
  },

  remove: async (id) => {
    await window.api.category.delete(id)
    await useCategoryStore.getState().fetch()
  },

  reorder: async (ids) => {
    await window.api.category.reorder(ids)
    await useCategoryStore.getState().fetch()
  },
}))
