// Resolving many names in one call.
//
// The real failure this fixes: an owner sends one message with five inventory
// items ("15 kilo كوردن", "10 شاهيتا حار", "4 برجر", …). Rules 8 and 9 tell the
// model to confirm a name before acting on it, so it called `ingredient_list`
// once per name — a tool that returns the whole table — and burned six of its
// eight steps on lookups before it reached a single write.
//
// One call that answers all five is the difference between a turn that acts and
// a turn that reads until it runs out. The resolver is the same strict one the
// write tools use, so a name that would not resolve still will not resolve —
// this is a cheaper way to ask, not a looser one.
import { z } from 'zod'
import { resolveIngredient } from './resolve'
import { toolOutput, type ToolDef } from './types'

/** Names per call. Enough for a whole message, small enough to stay cheap. */
export const MAX_NAMES = 10

export interface ResolvedName {
  query: string
  /** The matched row, or null when nothing matched. */
  matched: { id: string; name: string; unit: string; stock: number; pack: number } | null
  error?: string
}

/** Resolve each name in turn, keeping the order the model asked for. */
export function resolveNames(names: readonly string[]): ResolvedName[] {
  const out: ResolvedName[] = []
  for (const raw of names.slice(0, MAX_NAMES)) {
    const query = String(raw ?? '').trim()
    if (!query) continue

    // The pack-word fallback ("جركن هريسه" → "هريسه") lives in the shared
    // resolver, so this and the write tools agree on what a name means.
    const resolved = resolveIngredient(query)
    out.push(
      resolved.ok
        ? {
            query,
            matched: {
              id: resolved.row.id,
              name: resolved.row.name,
              unit: resolved.row.unit,
              stock: resolved.row.stockQuantity,
              pack: resolved.row.purchaseQty,
            },
          }
        : { query, matched: null, error: resolved.error },
    )
  }
  return out
}

export const RESOLVE_TOOLS: ToolDef[] = [
  {
    name: 'resolve_names',
    description:
      'حوّل كل أسماء المواد اللي في رسالة العميل لسجلات المخزون في استدعاء واحد. استخدمها قبل أي تعديل على أكتر من مادة، بدل ما تنادي ingredient_list لكل اسم.',
    write: false,
    schema: z.object({
      names: z.array(z.string()).min(1).max(MAX_NAMES).describe(
        'أسماء المواد زي ما العميل كتبها، واحد واحد',
      ),
    }),
    async run(args): Promise<ReturnType<typeof toolOutput>> {
      const results = resolveNames(args.names)
      const found = results.filter((entry) => entry.matched)
      const missing = results.filter((entry) => !entry.matched)

      const summary = missing.length === 0
        ? `اتعرفت ${found.length} مادة`
        : `اتعرفت ${found.length} من ${results.length} — مش لاقي: ${missing.map((entry) => entry.query).join('، ')}`

      return toolOutput(
        {
          resolved: results,
          // Only the names with no match are worth asking about; sending the
          // matches again would just be the table the model already has.
          unresolved: missing.map((entry) => entry.query),
        },
        summary.slice(0, 300),
      )
    },
  },
]
