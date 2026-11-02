// The remote POS treats every phone user as an owner (2–3 people, one PIN),
// so server routes may run the backend's admin-gated functions. Those read the
// session, which belongs to the desktop user; `runAs` lends them an owner
// identity for the async call chain only, so concurrent requests and the
// desktop cashier's session never interfere.
import * as session from '../backend/session'

const OWNER = { id: 'remote-owner', role: 'admin' }

/** Scope the whole request lifecycle (hooks + handler) to the owner identity. */
export function runAsOwner<T>(fn: () => T): T {
  return session.runAs(OWNER, fn)
}

export function asOwner<T>(fn: () => T): T {
  return runAsOwner(fn)
}

export async function asOwnerAsync<T>(fn: () => Promise<T>): Promise<T> {
  return runAsOwner(fn)
}
