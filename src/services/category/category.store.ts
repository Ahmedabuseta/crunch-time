import { create } from 'zustand'
import type { Category, CreateCategoryInput, UpdateCategoryInput } from './category.types'

interface CategoryStore {
  categories: Category[]
  loading: boolean
  fetch: () => Promise<void>
  create: (data: CreateCategoryInput) => Promise<string>
  update: (id: string, data: UpdateCategoryInput) => Promise<void>
  remove: (id: string, opts?: { hard?: boolean }) => Promise<void>
  reorder: (ids: string[]) => Promise<void>
}

export const useCategoryStore = create<CategoryStore>((set) => ({
  categories: [],
  loading: false,

  fetch: async () => {
    set({ loading: true })
    const data = await window.api.category.list() as Category[]
    const sorted = [...data].sort((a, b) => ((a.sortOrder ?? 0) - (b.sortOrder ?? 0)))
    set({ categories: sorted, loading: false })
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

  remove: async (id, opts) => {
    const result = await window.api.category.delete(id, opts) as { ok: boolean; error?: string }
    if (!result.ok) throw new Error(result.error || 'فشل حذف القسم')
    await useCategoryStore.getState().fetch()
  },

  reorder: async (ids) => {
    const current = useCategoryStore.getState().categories
    const idMap = new Map(current.map(c => [c.id, c]))
    const newCategories: Category[] = []
    ids.forEach((id, i) => {
      const cat = idMap.get(id)
      if (cat) newCategories.push({ ...cat, sortOrder: i + 1 })
    })
    current.forEach(c => {
      if (!ids.includes(c.id)) newCategories.push(c)
    })
    set({ categories: newCategories })

    await window.api.category.reorder(ids)
    await useCategoryStore.getState().fetch()
  },
}))
