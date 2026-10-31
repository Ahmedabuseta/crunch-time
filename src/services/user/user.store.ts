import { create } from 'zustand'
import type { User, CreateUserInput, UpdateUserInput, AuthenticatedUser } from './user.types'

interface UserStore {
  users: User[]
  currentUser: AuthenticatedUser | null
  loading: boolean
  /** Why the login list is empty, when it could not be loaded at all. */
  error: string | null
  fetch: () => Promise<void>
  create: (data: CreateUserInput) => Promise<string>
  update: (id: string, data: UpdateUserInput) => Promise<void>
  remove: (id: string, opts?: { hard?: boolean }) => Promise<void>
  login: (id: string, pin: string) => Promise<{ ok: boolean; error?: string }>
  logout: () => void
}

export const useUserStore = create<UserStore>((set) => ({
  users: [],
  currentUser: null,
  loading: false,
  error: null,

  fetch: async () => {
    set({ loading: true, error: null })
    try {
      const data = await window.api.user.list()
      set({ users: data as User[], loading: false })
    } catch (err: any) {
      // An empty login screen must explain itself: ask the main process what
      // failed at startup (database init) and show that instead of nothing.
      let detail = err?.message || 'تعذر تحميل المستخدمين'
      const [health, fatal] = await Promise.allSettled([
        window.api.app?.startupError?.(),
        window.api.app?.fatal?.(),
      ])
      // A bundle-load failure is the more specific reason, so it wins.
      const bundleError = fatal.status === 'fulfilled' ? fatal.value?.error : null
      const initError = health.status === 'fulfilled' ? health.value?.error : null
      if (bundleError) detail = `${detail} — ${bundleError}`
      else if (initError) detail = `${detail} — ${initError}`
      set({ users: [], loading: false, error: detail })
    }
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

  remove: async (id, opts) => {
    const result = await window.api.user.delete(id, opts) as { ok: boolean; error?: string }
    if (!result.ok) throw new Error(result.error || 'فشل حذف المستخدم')
    await useUserStore.getState().fetch()
  },

  login: async (id, pin) => {
    const result = await window.api.user.verifyPin(id, pin) as any
    if (result.ok) {
      set({ currentUser: result.user })
      await window.api.session.setUser(result.user)
      return { ok: true }
    }
    return { ok: false, error: result.error }
  },

  logout: () => {
    set({ currentUser: null })
    window.api.session.clearUser()
  },
}))
