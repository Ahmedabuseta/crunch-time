import { create } from 'zustand'
import type { User, CreateUserInput, UpdateUserInput, AuthenticatedUser } from './user.types'

interface UserStore {
  users: User[]
  currentUser: AuthenticatedUser | null
  loading: boolean
  fetch: () => Promise<void>
  create: (data: CreateUserInput) => Promise<string>
  update: (id: string, data: UpdateUserInput) => Promise<void>
  remove: (id: string) => Promise<void>
  login: (id: string, pin: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
}

export const useUserStore = create<UserStore>((set) => ({
  users: [],
  currentUser: null,
  loading: false,

  fetch: async () => {
    set({ loading: true })
    const data = await window.api.user.list()
    set({ users: data as User[], loading: false })
  },

  create: async (data) => {
    const result = await window.api.user.create(data) as { id: string }
    await useUserStore.getState().fetch()
    return result.id
  },

  update: async (id, data) => {
    await window.api.user.update(id, data)
    await useUserStore.getState().fetch()
  },

  remove: async (id) => {
    await window.api.user.delete(id)
    await useUserStore.getState().fetch()
  },

  login: async (id, pin) => {
    const result = await window.api.user.verifyPin(id, pin) as any
    if (result.ok) {
      set({ currentUser: result.user })
      return { ok: true }
    }
    return { ok: false, error: result.error }
  },

  logout: () => set({ currentUser: null }),
}))
