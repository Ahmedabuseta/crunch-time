import { create } from 'zustand'
import type { ModifierGroup, Modifier, ModifierGroupWithModifiers } from './modifier.types'

interface ModifierStore {
  groups: ModifierGroupWithModifiers[]
  loading: boolean
  fetchGroups: () => Promise<void>
  fetchByProduct: (productId: string) => Promise<ModifierGroupWithModifiers[]>
  createGroup: (data: any) => Promise<string>
  updateGroup: (id: string, data: any) => Promise<void>
  removeGroup: (id: string) => Promise<void>
  createModifier: (data: any) => Promise<string>
  updateModifier: (id: string, data: any) => Promise<void>
  removeModifier: (id: string) => Promise<void>
}

export const useModifierStore = create<ModifierStore>((set) => ({
  groups: [],
  loading: false,

  fetchGroups: async () => {
    set({ loading: true })
    const data = await window.api.modifier.listGroups()
    const groups: ModifierGroupWithModifiers[] = []
    for (const g of data as ModifierGroup[]) {
      const mods = await window.api.modifier.listByGroup(g.id)
      groups.push({ ...g, modifiers: mods as Modifier[] })
    }
    set({ groups, loading: false })
  },

  fetchByProduct: async (productId) => {
    return await window.api.modifier.listByProduct(productId) as ModifierGroupWithModifiers[]
  },

  createGroup: async (data) => {
    const result = await window.api.modifier.createGroup(data) as { id: string }
    await useModifierStore.getState().fetchGroups()
    return result.id
  },

  updateGroup: async (id, data) => {
    await window.api.modifier.updateGroup(id, data)
    await useModifierStore.getState().fetchGroups()
  },

  removeGroup: async (id) => {
    await window.api.modifier.deleteGroup(id)
    await useModifierStore.getState().fetchGroups()
  },

  createModifier: async (data) => {
    const result = await window.api.modifier.createModifier(data) as { id: string }
    await useModifierStore.getState().fetchGroups()
    return result.id
  },

  updateModifier: async (id, data) => {
    await window.api.modifier.updateModifier(id, data)
    await useModifierStore.getState().fetchGroups()
  },

  removeModifier: async (id) => {
    await window.api.modifier.deleteModifier(id)
    await useModifierStore.getState().fetchGroups()
  },
}))
