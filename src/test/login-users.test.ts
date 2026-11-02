// The login screen gets its user cards from `user:list`. When that call fails
// (database init failed in the main process), the store must keep the reason so
// the screen can explain the empty list instead of showing nothing.
import { describe, it, expect, beforeEach, afterEach } from 'vitest'

const { useUserStore } = await import('../services/user/user.store')

const originalWindow = (globalThis as any).window

const setBridge = (
  list: () => Promise<unknown>,
  startupError?: () => Promise<{ error: string | null }>,
  fatal?: () => Promise<{ error: string | null }>,
) => {
  ;(globalThis as any).window = {
    api: {
      user: { list },
      app: {
        startupError: startupError ?? (async () => ({ error: null })),
        fatal: fatal ?? (async () => ({ error: null })),
      },
    },
  }
}

beforeEach(() => {
  useUserStore.setState({ users: [], loading: false, error: null })
})

afterEach(() => {
  ;(globalThis as any).window = originalWindow
})

describe('user store fetch', () => {
  it('keeps the users it received', async () => {
    const rows = [{ id: 'u1', name: 'أحمد', role: 'admin', active: true }]
    setBridge(async () => rows)

    await useUserStore.getState().fetch()

    expect(useUserStore.getState().users).toEqual(rows)
    expect(useUserStore.getState().error).toBeNull()
  })

  it('reports the startup error when the user list cannot be read', async () => {
    setBridge(
      async () => { throw new Error('No handler registered') },
      async () => ({ error: 'database initialisation failed' }),
    )

    await useUserStore.getState().fetch()

    const state = useUserStore.getState()
    expect(state.users).toEqual([])
    expect(state.error).toContain('No handler registered')
    expect(state.error).toContain('database initialisation failed')
  })

  it('prefers the bundle-load error, which is the specific cause', async () => {
    setBridge(
      async () => { throw new Error('No handler registered for user:list') },
      async () => ({ error: 'database initialisation failed' }),
      async () => ({ error: 'Cannot find module argon2' }),
    )

    await useUserStore.getState().fetch()

    expect(useUserStore.getState().error).toContain('Cannot find module argon2')
  })

  it('survives a missing health channel', async () => {
    ;(globalThis as any).window = {
      api: { user: { list: async () => { throw new Error('boom') } } },
    }

    await useUserStore.getState().fetch()

    expect(useUserStore.getState().error).toContain('boom')
  })
})
