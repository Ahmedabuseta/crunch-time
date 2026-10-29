// Human-in-the-loop confirmation, as a workflow.
//
// This is the part Temporal is actually here for: the write proposal sits on
// the owner's phone while the app may restart, the machine may sleep and the
// owner may be at the till. `condition` is the native signal-or-timer race, so
// a late tap still lands and an abandoned one expires on its own.
import { condition, defineUpdate, proxyActivities, setHandler } from '@temporalio/workflow'
import type { Activities } from '../activities'

// Writes are idempotent by construction (src/ai/actions.ts applies each row at
// most once), so retrying is safe — but it is bounded tightly, because the
// owner is waiting on a button and a long retry tail looks like a hang.
const acts = proxyActivities<Pick<Activities, 'applyPendingAction' | 'cancelPendingAction' | 'expirePendingAction'>>({
  startToCloseTimeout: '30 seconds',
  retry: {
    initialInterval: '1s',
    backoffCoefficient: 2,
    maximumAttempts: 3,
    nonRetryableErrorTypes: ['ValidationError'],
  },
})

export const confirmUpdate = defineUpdate<{ accepted: boolean }, [boolean]>('confirm')

export interface ConfirmInput {
  actionId: string
}

export interface ConfirmResult {
  status: string
  ok: boolean
  error?: string
}

/** 15 minutes, matching `ACTION_TTL_MS` in src/ai/actions.ts. */
export const CONFIRM_WINDOW = '15 minutes'

export async function confirmAction(input: ConfirmInput): Promise<ConfirmResult> {
  let approved: boolean | null = null

  setHandler(
    confirmUpdate,
    (value: boolean) => {
      approved = value
      return { accepted: true }
    },
    {
      // Rejects a malformed update before it is accepted, so a bad client
      // cannot leave the workflow in a half-decided state.
      validator: (value: boolean) => {
        if (typeof value !== 'boolean') throw new Error('قرار التأكيد لازم يكون true أو false')
      },
    },
  )

  const arrived = await condition(() => approved !== null, CONFIRM_WINDOW)
  if (!arrived) {
    const expired = await acts.expirePendingAction({ actionId: input.actionId })
    return { status: expired.status, ok: expired.ok }
  }

  if (approved) {
    const applied = await acts.applyPendingAction({ actionId: input.actionId })
    return { status: applied.status, ok: applied.ok, error: applied.error }
  }

  const cancelled = await acts.cancelPendingAction({ actionId: input.actionId })
  return { status: cancelled.status, ok: cancelled.ok, error: cancelled.error }
}
