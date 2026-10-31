// Session state for the backend.
//
// The desktop sets the current user (session:setUser) for its own IPC calls.
// The remote server runs every request as a synthetic owner using
// `runAs()`, which is scoped to the async call chain (AsyncLocalStorage) —
// concurrent phone requests can never observe each other's elevation, and a
// cashier logged in on the desktop is never temporarily treated as an admin.
import { AsyncLocalStorage } from 'node:async_hooks'

export interface SessionUser { id: string; role: string }

const scopedUser = new AsyncLocalStorage<SessionUser>()
let desktopUser: SessionUser | null = null

export function setUser(user: SessionUser | null): void {
  desktopUser = user
}

export function clearUser(): void {
  desktopUser = null
}

export function getUser(): SessionUser | null {
  return scopedUser.getStore() ?? desktopUser
}

/** Run `fn` (sync or async) as `user` without touching the desktop session. */
export function runAs<T>(user: SessionUser, fn: () => T): T {
  return scopedUser.run(user, fn)
}

export function requireAdmin(): void {
  const user = getUser()
  if (!user || user.role !== 'admin') {
    throw new Error('Unauthorized — admin access required')
  }
}
