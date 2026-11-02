// The owner-facing half of aliases.
//
// Two reads (what the assistant failed to understand, what it has been taught)
// and one write that only ever proposes: `learn_alias` resolves the target,
// shows the mapping on a confirm card, and leaves the actual row to
// `executeAction`. That keeps a mistyped target from becoming permanent on a
// single model guess.
import { z } from 'zod'
import { createAction } from '../actions'
import { actionCard, tableCard, type ActionPreview } from '../cards'
import type { ToolOutput } from '../schemas'
import {
  entityLabel,
  getAliasTarget,
  listAliases,
  listUnresolved,
  type AliasEntity,
} from './alias-store'
import { resolveIngredient, resolveProduct } from './resolve'
import { toolOutput, type ToolDef } from './types'

const ENTITY = z.enum(['product', 'ingredient']).describe('product = صنف، ingredient = مادة خام')
const LIMIT = z.number().int().min(1).max(50).optional()

const ENTITY_NAME: Record<AliasEntity, string> = {
  product: entityLabel('product'),
  ingredient: entityLabel('ingredient'),
}

function stamp(value: string): string {
  return String(value ?? '').slice(0, 16).replace('T', ' ')
}

function entityOf(value: string | undefined): AliasEntity | undefined {
  return value === 'product' || value === 'ingredient' ? value : undefined
}

export const ALIAS_TOOLS: ToolDef[] = [
  {
    name: 'unresolved_queries',
    description: 'الأسماء اللي المساعد معرفش يطابقها (صنف أو مادة). راجعها عشان تعلّمه اسم بديل بـ learn_alias.',
    write: false,
    schema: z.object({
      entity: ENTITY.optional(),
      limit: LIMIT,
    }),
    async run(args): Promise<ToolOutput> {
      const filter = entityOf(args.entity)
      const limit = Math.min(Number(args.limit) || 20, 50)
      const rows = listUnresolved(filter, limit)
      const open = rows.filter((row) => !row.resolved).length

      const data = {
        entity: filter ?? 'all',
        total: rows.length,
        open,
        items: rows.map((row) => ({
          id: row.id,
          entity: row.entity,
          query: row.query,
          candidates: row.candidates,
          resolved: row.resolved,
          createdAt: row.createdAt,
        })),
      }

      const summary = rows.length
        ? `${rows.length} اسم المساعد معرفش يطابقه${open ? ` — ${open} لسه من غير حل` : ''}`
        : 'مفيش أسماء المساعد معرفش يطابقها'

      const cards = rows.length
        ? [
            tableCard(
              'أسماء محتاجة تعريف',
              ['الوقت', 'النوع', 'اللي اتكتب', 'أقرب حاجة', 'الحالة'],
              rows.map((row) => [
                stamp(row.createdAt),
                ENTITY_NAME[row.entity] ?? row.entity,
                row.query,
                row.candidates.length ? row.candidates.join(' / ') : '—',
                row.resolved ? 'اتحلّت' : 'مفتوحة',
              ]),
            ),
          ]
        : []

      return toolOutput(data, summary, cards)
    },
  },

  {
    name: 'list_aliases',
    description: 'الأسماء البديلة اللي اتعلمها المساعد: الاسم اللي بيتقال والصنف أو المادة اللي بيروح لها.',
    write: false,
    schema: z.object({
      entity: ENTITY.optional(),
      limit: LIMIT,
    }),
    async run(args): Promise<ToolOutput> {
      const filter = entityOf(args.entity)
      const limit = Math.min(Number(args.limit) || 20, 50)
      const rows = listAliases(filter, limit)

      const data = {
        entity: filter ?? 'all',
        total: rows.length,
        items: rows.map((row) => ({
          id: row.id,
          entity: row.entity,
          alias: row.alias,
          targetId: row.targetId,
          target: row.targetName,
          active: row.targetActive,
          createdAt: row.createdAt,
        })),
      }

      const summary = rows.length
        ? `${rows.length} اسم بديل محفوظ`
        : 'مفيش أسماء بديلة محفوظة لسه — علّمه واحد بـ learn_alias'

      const cards = rows.length
        ? [
            tableCard(
              'الأسماء البديلة',
              ['النوع', 'الاسم اللي بيتقال', 'بيروح لـ', 'الحالة'],
              rows.map((row) => [
                ENTITY_NAME[row.entity] ?? row.entity,
                row.alias,
                row.targetName ?? row.targetId,
                row.targetActive === false ? 'الهدف مخفي' : row.targetName ? 'ظاهر' : 'الهدف مش موجود',
              ]),
            ),
          ]
        : []

      return toolOutput(data, summary, cards)
    },
  },

  {
    name: 'learn_alias',
    description: 'علّم المساعد اسم بديل: «لما أقول كذا، اقصد الصنف/المادة دي». بيعرض كارت تأكيد ومش بيكتب قبل التأكيد.',
    write: true,
    schema: z.object({
      entity: ENTITY,
      alias: z.string().trim().min(1).max(60).describe('الاسم اللي صاحب المطعم بيقوله'),
      target: z.string().min(1).describe('اسم الصنف أو المادة أو id'),
    }),
    async run(args, ctx): Promise<ToolOutput> {
      const alias = String(args.alias ?? '').trim()
      if (!alias) return toolOutput({ error: 'اكتب الاسم البديل الأول' }, 'اكتب الاسم البديل الأول')

      const entity: AliasEntity = args.entity
      const isProduct = entity === 'product'
      const resolved = isProduct
        ? resolveProduct(args.target, { includeInactive: true })
        : resolveIngredient(args.target, { includeInactive: true })
      if (!resolved.ok) return toolOutput({ error: resolved.error }, resolved.error)

      const name = String(resolved.row.name)
      const active = 'active' in resolved.row ? Boolean((resolved.row as { active?: boolean }).active) : true
      const targetId = String(resolved.row.id)
      const previousId = getAliasTarget(entity, alias)
      const previousName = previousId && previousId !== targetId
        ? (isProduct ? resolveProduct(previousId, { includeInactive: true }) : resolveIngredient(previousId, { includeInactive: true }))
        : null
      const previous = previousName && previousName.ok ? String(previousName.row.name) : null

      const preview: ActionPreview = {
        title: 'ربط اسم بديل',
        subject: name,
        rows: [
          { label: 'النوع', value: ENTITY_NAME[entity] },
          { label: 'الاسم البديل', value: alias },
          { label: 'بيروح لـ', value: name },
          ...(active ? [] : [{ label: 'الحالة', value: 'الصنف مخفي من المنيو' }]),
        ],
        result: `لما تقول «${alias}» هفهم إنك تقصد ${name}.`,
        warning: previous
          ? `الاسم ده كان مربوط بـ«${previous}» والتأكيد هيغيّره لـ«${name}».`
          : undefined,
      }

      const action = createAction('learn_alias', { entity, alias, targetId }, preview)
      ctx.cards.push(actionCard(action.id, 'proposed', preview))

      return toolOutput(
        { actionId: action.id, entity, alias, target: name, targetId, active },
        `جاهز أربط «${alias}» بـ«${name}» — مستني تأكيدك`,
        [],
      )
    },
  },
]
