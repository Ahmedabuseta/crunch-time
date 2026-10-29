// The owner identity the remote server lends to admin-gated backend calls.
//
// Mirrors src/server/privileges.ts rather than importing it: the server imports
// this module's siblings, and a cycle between src/server and src/ai would make
// module load order matter. Twenty lines duplicated is cheaper than that.
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
