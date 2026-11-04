import { create } from 'zustand'
import type { ModifierGroup, Modifier, ModifierGroupWithModifiers } from './modifier.types'

interface ModifierStore {
  groups: ModifierGroupWithModifiers[]
  includeInactive: boolean
  loading: boolean
  fetchGroups: (includeInactive?: boolean) => Promise<void>
  fetchByProduct: (productId: string) => Promise<ModifierGroupWithModifiers[]>
  createGroup: (data: any) => Promise<string>
  updateGroup: (id: string, data: any) => Promise<void>
  removeGroup: (id: string, opts?: { hard?: boolean }) => Promise<void>
  reorderGroups: (ids: string[]) => Promise<void>
  createModifier: (data: any) => Promise<string>
  updateModifier: (id: string, data: any) => Promise<void>
  removeModifier: (id: string, opts?: { hard?: boolean }) => Promise<void>
  reorderModifiers: (ids: string[]) => Promise<void>
}

export const useModifierStore = create<ModifierStore>((set, get) => ({
  groups: [],
  includeInactive: false,
  loading: false,

  fetchGroups: async (includeInactive = false) => {
    set({ loading: true })
    const data = await window.api.modifier.listGroups(includeInactive)
    const groups: ModifierGroupWithModifiers[] = []
    for (const g of data as ModifierGroup[]) {
      const mods = await window.api.modifier.listByGroup(g.id, includeInactive)
      groups.push({ ...g, modifiers: mods as Modifier[] })
    }
    set({ groups, includeInactive, loading: false })
  },

  fetchByProduct: async (productId) => {
    return await window.api.modifier.listByProduct(productId) as ModifierGroupWithModifiers[]
  },

  createGroup: async (data) => {
    const result = await window.api.modifier.createGroup(data) as { id: string }
    await get().fetchGroups(get().includeInactive)
    return result.id
  },

  updateGroup: async (id, data) => {
    await window.api.modifier.updateGroup(id, data)
    await get().fetchGroups(get().includeInactive)
  },

  removeGroup: async (id, opts) => {
    const result = await window.api.modifier.deleteGroup(id, opts) as { ok: boolean; error?: string }
    if (!result.ok) throw new Error(result.error || 'فشل حذف مجموعة الخيارات')
    await get().fetchGroups(get().includeInactive)
  },

  reorderGroups: async (ids) => {
    await window.api.modifier.reorderGroups(ids)
    await get().fetchGroups(get().includeInactive)
  },

  createModifier: async (data) => {
    const result = await window.api.modifier.createModifier(data) as { id: string }
    await get().fetchGroups(get().includeInactive)
    return result.id
  },

  updateModifier: async (id, data) => {
    await window.api.modifier.updateModifier(id, data)
    await get().fetchGroups(get().includeInactive)
  },

  removeModifier: async (id, opts) => {
    const result = await window.api.modifier.deleteModifier(id, opts) as { ok: boolean; error?: string }
    if (!result.ok) throw new Error(result.error || 'فشل حذف الخيار')
    await get().fetchGroups(get().includeInactive)
  },

  reorderModifiers: async (ids) => {
    await window.api.modifier.reorderModifiers(ids)
    await get().fetchGroups(get().includeInactive)
  },
}))
