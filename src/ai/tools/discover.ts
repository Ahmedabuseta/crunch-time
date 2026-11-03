// Tool discovery.
//
// The keyword router exposes a small subset per message. When it misses — an
// unusual wording, a synonym the regex list never learned — the model would
// otherwise be stuck with whatever it was given. `find_tools` is the escape
// hatch: it returns names and one-line descriptions, and the workflow adds
// those names to the next step's schemas.
import { z } from 'zod'
import { normalizeArabic, words } from '../guard/arabic'
import { toolOutput, type ToolDef } from './types'

const FALLBACK = ['query_metrics', 'product_list', 'ingredient_list', 'inventory_status', 'query_database']

const STOP_WORDS = new Set([
  'من', 'في', 'على', 'عن', 'مع', 'ايه', 'إيه', 'اللي', 'لو', 'او', 'أو', 'و', 'يا', 'انا', 'أنا',
  'عايز', 'عاوز', 'محتاج', 'دلوقتي', 'كام', 'هو', 'هي', 'ده', 'دي',
])

export function scoreTools(all: readonly ToolDef[], query: string, limit = 6): ToolDef[] {
  const text = normalizeArabic(query)
  const tokens = words(text).filter((token) => token.length >= 3 && !STOP_WORDS.has(token))
  if (tokens.length === 0) return fallback(all, limit)

  const scored = all
    .filter((tool) => tool.name !== 'find_tools')
    .map((tool) => {
      const haystack = normalizeArabic(`${tool.name} ${tool.description}`)
      let score = 0
      // An exact tool name mentioned in the query is a strong signal.
      if (text.includes(normalizeArabic(tool.name))) score += 10
      for (const token of tokens) {
        if (haystack.includes(token)) score += 1
      }
      return { tool, score }
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.tool.name.localeCompare(b.tool.name))

  if (scored.length === 0) return fallback(all, limit)
  return scored.slice(0, clamp(limit)).map((entry) => entry.tool)
}

function fallback(all: readonly ToolDef[], limit: number): ToolDef[] {
  const byName = new Map(all.map((tool) => [tool.name, tool]))
  const selected = FALLBACK.map((name) => byName.get(name)).filter((tool): tool is ToolDef => Boolean(tool))
  return (selected.length > 0 ? selected : all.filter((tool) => !tool.write)).slice(0, clamp(limit))
}

function clamp(limit: number): number {
  return Math.min(8, Math.max(1, Math.trunc(Number(limit) || 6)))
}

/**
 * A getter rather than the array: `ALL_TOOLS` is built after this tool exists,
 * so capturing it here would read an uninitialised binding.
 */
export function createDiscoverTool(all: () => readonly ToolDef[]): ToolDef {
  return {
    name: 'find_tools',
    description:
      'ابحث عن أداة مش ظاهرة في القائمة بكلمات وصفية (زي «تالف» أو «وصفة فرعية» أو «مورد»). ترجع أسماء وأوصاف بس — نادي الأداة اللي تعجبك في الخطوة اللي بعدها.',
    write: false,
    schema: z.object({
      query: z.string().min(2).max(120).describe('كلمات وصفية عن الأداة اللي محتاجها'),
      limit: z.number().int().min(1).max(8).optional().describe('عدد النتائج، افتراضي 6'),
    }),
    async run(args): Promise<ReturnType<typeof toolOutput>> {
      const found = scoreTools(all(), args.query, args.limit ?? 6)
      return toolOutput(
        {
          tools: found.map((tool) => ({ name: tool.name, description: tool.description, write: tool.write })),
        },
        found.length
          ? `لقيت ${found.length} أداة: ${found.map((tool) => tool.name).join('، ')}`
          : 'مفيش أداة مطابقة — جرّب كلمات تانية',
      )
    },
  }
}
