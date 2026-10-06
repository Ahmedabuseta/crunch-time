import { create } from 'zustand'
import type { Addon, CreateAddonInput, UpdateAddonInput } from './addon.types'

interface AddonStore {
  addons: Addon[]
  loading: boolean
  fetch: () => Promise<void>
  create: (data: CreateAddonInput) => Promise<string>
  update: (id: string, data: UpdateAddonInput) => Promise<void>
  remove: (id: string, opts?: { hard?: boolean }) => Promise<void>
}

export const useAddonStore = create<AddonStore>((set) => ({
  addons: [],
  loading: false,

  fetch: async () => {
    set({ loading: true })
    const data = await window.api.addon.list()
    set({ addons: data as Addon[], loading: false })
  },

  create: async (data) => {
    const result = await window.api.addon.create(data) as { id: string }
    await useAddonStore.getState().fetch()
    return result.id
  },

  update: async (id, data) => {
    await window.api.addon.update(id, data)
    await useAddonStore.getState().fetch()
  },

  remove: async (id, opts) => {
    const result = await window.api.addon.delete(id, opts) as { ok: boolean; error?: string }
    if (!result.ok) throw new Error(result.error || 'فشل حذف الإضافة')
    await useAddonStore.getState().fetch()
  },
}))
