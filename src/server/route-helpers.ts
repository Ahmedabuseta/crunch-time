// Helpers shared by every server route module.
//
// Backend functions either return `{ ok, error }` or throw (validation). A
// global error handler (registered in routes.ts) turns a throw into a 400 with
// the Arabic message, so routes can simply call the backend and return.
import type { FastifyRequest } from 'fastify'
import { writeAudit, withDeviceLabel } from '../backend/audit'
import { getSqlite } from '../db/client'
import { asOwner, asOwnerAsync } from './privileges'
import { deviceLabel, num } from './util'

export { asOwner, asOwnerAsync, deviceLabel, num }

/**
 * The user a phone-side record should be attributed to. Shifts.user_id is a
 * NOT NULL foreign key and the phone has no desktop user, so an owner (the
 * first active admin) stands in.
 */
export function ownerUserId(): string {
  const sqlite = getSqlite()
  const admin = sqlite.prepare(
    "SELECT id FROM users WHERE role = 'admin' AND active = 1 ORDER BY created_at LIMIT 1",
  ).get() as { id: string } | undefined
  if (admin?.id) return admin.id
  const any = sqlite.prepare('SELECT id FROM users LIMIT 1').get() as { id: string } | undefined
  return any?.id ?? ''
}

export interface MutationSpec {
  action: string
  entity: string
  /** Defaults to the result's `id`, or the value returned by entityIdFrom. */
  entityId?: string | null
  entityIdFrom?: (result: any) => string | null
  before?: unknown
  afterFrom?: (result: any) => unknown
}

/**
 * Runs an admin mutation as the lent owner identity and writes an audit row.
 * Used by every mutating route so the whole HTTP admin surface is audited.
 */
export async function mutate<T>(req: FastifyRequest, spec: MutationSpec, run: () => T): Promise<T> {
  const label = deviceLabel(req.headers as Record<string, any>, req.body)
  const result = await withDeviceLabel(label, () => asOwnerAsync(async () => run()))
  // A refused mutation (ok:false) is not audited.
  if (result && typeof result === 'object' && (result as any).ok === false) return result
  const entityId = spec.entityId
    ?? spec.entityIdFrom?.(result)
    ?? (result && typeof result === 'object' && 'id' in (result as any) ? String((result as any).id) : null)
  writeAudit({
    action: spec.action,
    entity: spec.entity,
    entityId,
    before: spec.before ?? null,
    after: spec.afterFrom ? spec.afterFrom(result) : result,
    deviceLabel: label,
  })
  return result
}
