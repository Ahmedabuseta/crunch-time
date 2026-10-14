// The remote POS treats every phone user as an owner (2–3 people, one PIN),
// so server routes may run the backend's admin-gated functions. Those read the
// desktop session, which is empty in the server — so we lend them an owner
// identity for the duration of the call and restore the desktop's session after.
import * as session from '../backend/session'

const OWNER = { id: 'remote-owner', role: 'admin' }

export function asOwner<T>(fn: () => T): T {
  const prev = session.getUser()
  session.setUser(OWNER)
  try {
    return fn()
  } finally {
    session.setUser(prev)
  }
}

export async function asOwnerAsync<T>(fn: () => Promise<T>): Promise<T> {
  const prev = session.getUser()
  session.setUser(OWNER)
  try {
    return await fn()
  } finally {
    session.setUser(prev)
  }
}
