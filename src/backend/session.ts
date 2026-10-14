// Session state for the backend. The desktop sets the current user
// (session:setUser); admin-gated backend functions call requireAdmin().
export interface SessionUser { id: string; role: string }

let sessionUser: SessionUser | null = null

export function setUser(user: SessionUser | null): void {
  sessionUser = user
}

export function clearUser(): void {
  sessionUser = null
}

export function getUser(): SessionUser | null {
  return sessionUser
}

export function requireAdmin(): void {
  if (!sessionUser || sessionUser.role !== 'admin') {
    throw new Error('Unauthorized — admin access required')
  }
}
