import { create } from 'zustand'
import type { Addon, CreateAddonInput, UpdateAddonInput } from './addon.types'

interface AddonStore {
  addons: Addon[]
  /** Admin pages ask for hidden rows too; the sales screens keep the default. */
  includeInactive: boolean
  loading: boolean
  fetch: (includeInactive?: boolean) => Promise<void>
  create: (data: CreateAddonInput) => Promise<string>
  update: (id: string, data: UpdateAddonInput) => Promise<void>
  remove: (id: string, opts?: { hard?: boolean }) => Promise<void>
}

export const useAddonStore = create<AddonStore>((set, get) => ({
  addons: [],
  includeInactive: false,
  loading: false,

  fetch: async (includeInactive = false) => {
    set({ loading: true })
    const data = await window.api.addon.list(includeInactive)
    set({ addons: data as Addon[], includeInactive, loading: false })
  },

  create: async (data) => {
    const result = await window.api.addon.create(data) as { id: string }
    await get().fetch(get().includeInactive)
    return result.id
  },

  update: async (id, data) => {
    await window.api.addon.update(id, data)
    await get().fetch(get().includeInactive)
  },

  remove: async (id, opts) => {
    const result = await window.api.addon.delete(id, opts) as { ok: boolean; error?: string }
    if (!result.ok) throw new Error(result.error || 'فشل حذف الإضافة')
    await get().fetch(get().includeInactive)
  },
}))
