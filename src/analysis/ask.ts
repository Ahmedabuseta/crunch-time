import { generateText, stepCountIs, tool, type LanguageModel, type ModelMessage } from 'ai'
import { z } from 'zod'
import type Database from 'better-sqlite3'
import { describeSchema, type TableInfo } from './schema'
import { previewRows, type QueryResult } from './runner'

const MODEL_ROWS = 40

/**
 * Groq's GPT-OSS models return `reasoning_content`, but reject it when it is
 * sent back on an assistant message in the next tool-loop request. The SDK
 * turns it into a `reasoning` content part, so dropping that part before each
 * step keeps the loop compatible without losing the tool call.
 */
function stripReasoning(message: ModelMessage): ModelMessage {
  if (message.role !== 'assistant') return message

  const source = message as any
  if (!Array.isArray(source.content)) return message

  const content = source.content.filter((part: any) => part?.type !== 'reasoning')
  const next: any = { ...source, content }
  delete next.reasoning
  delete next.reasoning_content
  return next as ModelMessage
}

export interface AskToolCall {
  id: string
  name: string
  args: unknown
}

export interface AskToolResult {
  id: string
  name: string
  output: unknown
}

export interface AskStep {
  index: number
  text: string
  reasoning: string | null
  finishReason: string | null
  toolCalls: AskToolCall[]
  toolResults: AskToolResult[]
  usage: {
    inputTokens: number
    outputTokens: number
    reasoningTokens: number
  }
}

export interface AskContext {
  provider: string | null
  model: string | null
  tables: number
  startedAt: string
  durationMs: number
}

export interface AskQuery extends QueryResult {
  sql: string
  purpose: string | null
  toolCallId: string | null
  error?: string
}

export interface AskResult {
  question: string
  answer: string
  queries: AskQuery[]
  steps: number
  trace: AskStep[]
  context: AskContext
  usage: {
    inputTokens: number
    outputTokens: number
  }
}

export interface AskInput {
  question: string
  /** Used for the cheap schema reads (pragma per table). */
  database: Database.Database
  /** SELECT execution — routed to the snapshot's worker with a hard deadline. */
  query: (sql: string, maxRows: number) => Promise<QueryResult>
  model: LanguageModel
  maxRows: number
  maxSteps?: number
  /** Snapshot creation time, so the prompt can state how fresh the data is. */
  dataAsOf?: number
}

const SENSITIVE_COLUMN = /pin|hash|secret|token|api_?key|password|cipher/i

export const TABLE_NOTES: Record<string, string> = {
  orders: 'فواتير البيع (صف لكل فاتورة). status: COMPLETED|REFUNDED|CANCELLED. order_type: delivery|dine-in|takeaway. payment_type: cash|visa|card|wallet. created_at نص ISO UTC. total الإجمالي النهائي، discount_amount خصم الفاتورة، delivery_fee رسوم التوصيل.',
  order_items: 'سطور الفاتورة. صافي السطر = quantity × unit_price − item_discount. product_id يربط المنتج. خصم الفاتورة الإجمالي على orders مش هنا.',
  products: 'المنيو: price، cost_price (من الوصفة)، category_id، active. cost_price = 0 معناها التكلفة غير محددة.',
  categories: 'أقسام المنيو؛ sort_order للترتيب.',
  addons: 'الإضافات وسعرها؛ active.',
  product_addons: 'ربط الإضافات بالمنتجات.',
  modifier_groups: 'مجموعات الخيارات: single-select أو multi-select.',
  modifiers: 'خيارات المجموعة؛ price_adjustment ممكن يكون سالب.',
  product_modifier_groups: 'ربط مجموعات الخيارات بالمنتجات.',
  ingredients: 'المخزون: stock_quantity، min_stock، cost_per_unit، category، storage، active.',
  recipes: 'مكونات المنتج: quantity_per_unit من ingredient_id أو sub_recipe_id.',
  addon_recipes: 'مكونات الإضافة.',
  modifier_recipes: 'مكونات الخيار.',
  sub_recipes: 'مكونات مُحضَّرة تُستخدم داخل الوصفات.',
  sub_recipe_ingredients: 'مكونات الوصفة الفرعية.',
  inventory_transactions: 'حركة المخزون: type (CONSUMPTION|ADJUSTMENT|WASTE|PURCHASE|RETURN...)، quantity، unit_cost، reference_order_id.',
  purchase_price_history: 'تاريخ أسعار الشراء لكل مادة/مورد.',
  payments: 'مدفوعات الفاتورة: method، amount، created_at.',
  cash_movements: 'حركة الدرج لكل وردية: SALE|CASH_IN|CASH_OUT|OPENING|CLOSING...',
  shifts: 'الورديات: status open|closed، opening_cash، closing_cash، started_at/ended_at.',
  users: 'المستخدمون: role admin|cashier. متستخدمش pin_hash.',
  expenses: 'المصروفات التشغيلية.',
  discount_codes: 'أكواد الخصم وقواعدها.',
  delivery_zones: 'مناطق التوصيل ورسومها.',
  delivery_profiles: 'بيانات السائقين.',
  customers: 'عملاء التوصيل المتكررون.',
  settings: 'إعدادات المتجر؛ متعرضش أي مفاتيح أو أسرار.',
}

export const COLUMN_NOTES: Record<string, string> = {
  'orders.status': 'COMPLETED|REFUNDED|CANCELLED',
  'orders.order_type': 'delivery|dine-in|takeaway',
  'orders.payment_type': 'cash|visa|card|wallet',
  'orders.created_at': 'ISO UTC',
  'order_items.unit_price': 'سعر الوحدة قبل خصم السطر',
  'order_items.item_discount': 'خصم السطر',
  'products.cost_price': 'تكلفة الوحدة من الوصفة',
  'shifts.status': 'open|closed',
  'users.role': 'admin|cashier',
  'inventory_transactions.type': 'CONSUMPTION|ADJUSTMENT|WASTE|PURCHASE|RETURN',
}

const CORE_TABLES = [
  'orders', 'order_items', 'products', 'categories', 'addons', 'product_addons',
  'modifier_groups', 'modifiers', 'product_modifier_groups', 'ingredients', 'recipes',
  'addon_recipes', 'modifier_recipes', 'inventory_transactions', 'purchase_price_history',
  'shifts', 'users', 'payments', 'cash_movements', 'expenses', 'discount_codes',
  'delivery_zones', 'delivery_profiles', 'customers', 'settings',
]

function localToday(): string {
  const now = new Date()
  const pad = (value: number) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

interface BusinessContext {
  restaurant: string
  currency: string
  taxPercent: number
  deliveryFee: number
}

function readBusinessContext(database: Database.Database): BusinessContext | null {
  try {
    const row = database.prepare(
      'SELECT restaurant_name AS restaurant, currency_label AS currency, tax_rate AS taxRate, delivery_fee AS deliveryFee FROM settings WHERE id = ?',
    ).get('settings') as {
      restaurant?: string
      currency?: string
      taxRate?: number
      deliveryFee?: number
    } | undefined

    if (!row) return null
    const rate = Number(row.taxRate) || 0
    return {
      restaurant: String(row.restaurant || 'Crunch Time'),
      currency: String(row.currency || 'ج.م'),
      taxPercent: rate > 1 ? rate : rate * 100,
      deliveryFee: Number(row.deliveryFee) || 0,
    }
  } catch {
    return null
  }
}

function schemaText(tables: TableInfo[], maxChars = 12_000): string {
  const rank = new Map(CORE_TABLES.map((name, index) => [name, index]))
  const ordered = [...tables].sort((a, b) => {
    const ai = rank.get(a.name) ?? CORE_TABLES.length
    const bi = rank.get(b.name) ?? CORE_TABLES.length
    return ai - bi || a.name.localeCompare(b.name)
  })

  const lines: string[] = []
  for (const table of ordered) {
    const columns = table.columns
      .filter((column) => !SENSITIVE_COLUMN.test(column.name))
      .map((column) => {
        const note = COLUMN_NOTES[`${table.name}.${column.name}`]
        return `${column.name} ${column.type || 'TEXT'}${column.primaryKey ? ' PK' : ''}${note ? ` [${note}]` : ''}`
      })
    if (columns.length === 0) continue

    const note = TABLE_NOTES[table.name]
    const foreignKeys = table.foreignKeys
      .map((foreignKey) => `${foreignKey.from}→${foreignKey.table}.${foreignKey.to}`)
      .join(', ')
    lines.push(
      `- ${table.name} (${table.rowCount.toLocaleString('en-US')} صف)${note ? ` — ${note}` : ''}\n  ${columns.join(' | ')}${foreignKeys ? `\n  FK: ${foreignKeys}` : ''}`,
    )
  }

  let text = ''
  for (const line of lines) {
    if (text.length + line.length + 2 > maxChars) return `${text}\n… (باقي الجداول محذوفة — استكشفها بـ SELECT)`
    text += `${text ? '\n' : ''}${line}`
  }
  return text
}

function systemPrompt(schema: string, business: BusinessContext | null, dataAsOf?: number): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'local'
  const asOf = dataAsOf
    ? `${new Date(dataAsOf).toISOString().replace('T', ' ').slice(0, 16)} UTC`
    : null

  return [
    `أنت محلل بيانات خبير لنظام كاشير مطعم${business ? ` «${business.restaurant}»` : ''} على SQLite.`,
    `النهاردة ${localToday()} (توقيت الجهاز: ${timeZone}).`,
    business
      ? `العملة: ${business.currency}. نسبة الضريبة: ${Math.round(business.taxPercent * 10) / 10}%. رسوم التوصيل الافتراضية: ${business.deliveryFee}.`
      : '',
    asOf
      ? `البيانات من نسخة snapshot بتاريخ ${asOf} — قد تكون متأخرة دقائق عن اللحظة الحالية، وكل الاستعلامات على النسخة دي فقط.`
      : 'البيانات من نسخة قراءة فقط، وكل الاستعلامات على النسخة دي فقط.',
    '',
    'تفهم العربية (فصحى/عامية مصرية) والإنجليزية وخليطهم. أجب بنفس لغة السؤال. أسماء الجداول والأعمدة إنجليزية — استخدمها كما هي.',
    'مصطلحات: مبيعات=sales/revenue، طلبات=orders، أصناف=products/items، مخزون=inventory/stock، وردية=shift، خصم=discount، دليفري=delivery، صالة=dine-in، سفري=takeaway، كاش=cash، فيزا=visa/card.',
    '',
    'قواعد صارمة:',
    '- SELECT أو WITH فقط، استعلام واحد كل مرة. ممنوع PRAGMA/ATTACH/INSERT/UPDATE/DELETE أو أي كتابة.',
    '- استخدم أسماء الأعمدة من المخطط. متخمّنش عمود مش موجود.',
    '- اكتب أعمدة صريحة، وحدّد LIMIT (أقصى 100 صف) لما النتيجة ممكن تكون كبيرة.',
    '- الأرقام اللي بتذكرها لازم تكون من نتيجة الاستعلام بالظبط. ممنوع تأليف أرقام.',
    '- لو الاستعلام فشل، اقرأ الخطأ وصحّحه وجرّب تاني.',
    '- استبعد الطلبات CANCELLED إلا لو السؤال عنها. REFUNDED حالة منفصلة.',
    "- created_at نص ISO UTC. لليوم المحلي استخدم date(created_at, 'localtime') أو نطاق يوم محلي.",
    '- الإيراد = SUM(orders.total) للطلبات غير الملغاة. صافي السطر = quantity*unit_price - item_discount. خصم الفاتورة على orders.discount_amount ورسوم التوصيل على orders.delivery_fee.',
    '- التكلفة/الربح: products.cost_price (من الوصفة) × الكمية. لو cost_price = 0 فالتكلفة غير محددة.',
    '- المخزون: ingredients.stock_quantity و min_stock؛ الحركة في inventory_transactions.',
    '',
    'قاموس الأعمال:',
    '- orders فاتورة، order_items سطورها؛ product_id/category_id للتحليل حسب الصنف/القسم.',
    '- products/categories للمنيو، addons/modifiers للخيارات، وربطها في product_addons/product_modifier_groups.',
    '- ingredients/recipes/inventory_transactions للمخزون والتكلفة؛ purchase_price_history لأسعار الشراء.',
    '- shifts/users/payments/cash_movements للورديات والكاشير والدرج.',
    '- delivery_zones/delivery_profiles/customers للتوصيل؛ expenses للمصروفات؛ discount_codes للخصومات.',
    '- settings لإعدادات المتجر فقط (بدون أي مفاتيح/أسرار).',
    '',
    'أمثلة (عربي/English):',
    "- «كام بعت النهاردة؟» / sales today → SUM(total) ... WHERE status <> 'CANCELLED' AND date(created_at,'localtime') = date('now','localtime')",
    '- «أعلى 5 أصناف مبيعاً الشهر ده» / top 5 products this month → join order_items/products، group by product، order by quantity desc، LIMIT 5',
    '- «إيه المواد اللي تحت الحد الأدنى؟» / ingredients below minimum → ingredients WHERE stock_quantity < min_stock',
    '- «مبيعات كل كاشير» / sales by cashier → group by orders.cashier_name',
    '',
    'الرد النهائي: Markdown مختصر، والجداول مسموحة. اذكر الأرقام المهمة والافتراضات لو السؤال ناقص.',
    '',
    'المخطط:',
    schema,
  ].filter(Boolean).join('\n')
}

export async function askQuestion(input: AskInput): Promise<AskResult> {
  const question = String(input.question ?? '').trim()
  if (!question) throw new Error('اكتب سؤال تحليلي')

  // A dev build can leave an old main process alive while the renderer reloads.
  // The old call shape handed the Snapshot object here, which fails deep inside
  // better-sqlite3 as `database.prepare is not a function`; fail with the fix.
  if (!input.database || typeof input.database.prepare !== 'function' || typeof input.query !== 'function') {
    throw new Error('نسخة التحليل مش جاهزة — اقفل التطبيق وشغّله من جديد لتحميل النسخة الحالية')
  }

  const startedAt = new Date()
  const started = Date.now()
  const tables = describeSchema(input.database, {
    exclude: /^(ai_|schema_migrations$|idempotency_keys$)/,
  })
  const business = readBusinessContext(input.database)
  const queries: AskQuery[] = []
  const maxRows = Math.max(1, Math.trunc(input.maxRows))

  const result = await generateText({
    model: input.model,
    system: systemPrompt(schemaText(tables), business, input.dataAsOf),
    prompt: question,
    tools: {
      run_sql: tool({
        description: 'نفّذ استعلام SELECT واحد على نسخة قراءة فقط من قاعدة بيانات الكاشير. استخدمها لجمع الأرقام قبل الرد.',
        inputSchema: z.object({
          sql: z.string().describe('استعلام SQLite واحد يبدأ بـ SELECT أو WITH. ممنوع أي تعديل.'),
          purpose: z.string().optional().describe('الغرض من الاستعلام في كلمات قليلة'),
        }),
        execute: async ({ sql, purpose }, options) => {
          const toolCallId = (options as { toolCallId?: string } | undefined)?.toolCallId ?? null

          try {
            const output = await input.query(sql, maxRows)
            queries.push({ sql, purpose: purpose ?? null, toolCallId, ...output })
            const preview = previewRows(output.rows, MODEL_ROWS)
            return {
              ok: true,
              columns: output.columns,
              rows: preview.rows,
              rowCount: output.rowCount,
              truncated: output.truncated || preview.truncated,
              elapsedMs: output.elapsedMs,
            }
          } catch (error) {
            const message = error instanceof Error ? error.message : 'فشل الاستعلام'
            queries.push({
              sql,
              purpose: purpose ?? null,
              toolCallId,
              columns: [],
              rows: [],
              rowCount: 0,
              truncated: false,
              elapsedMs: 0,
              error: message,
            })
            return { ok: false, error: message }
          }
        },
      }),
    },
    stopWhen: stepCountIs(input.maxSteps ?? 5),
    prepareStep: ({ messages }) => ({
      messages: messages.map(stripReasoning),
    }),
    maxRetries: 1,
  })

  const trace: AskStep[] = result.steps.map((step) => ({
    index: step.stepNumber,
    text: step.text?.trim() || '',
    reasoning: step.reasoningText?.trim() || null,
    finishReason: step.finishReason ?? null,
    toolCalls: (step.toolCalls ?? []).map((call: any) => ({
      id: String(call.toolCallId ?? ''),
      name: String(call.toolName ?? ''),
      args: call.input ?? null,
    })),
    toolResults: (step.toolResults ?? []).map((entry: any) => ({
      id: String(entry.toolCallId ?? ''),
      name: String(entry.toolName ?? ''),
      output: entry.output ?? null,
    })),
    usage: {
      inputTokens: Number(step.usage?.inputTokens ?? 0) || 0,
      outputTokens: Number(step.usage?.outputTokens ?? 0) || 0,
      reasoningTokens: Number(step.usage?.outputTokenDetails?.reasoningTokens ?? 0) || 0,
    },
  }))

  const firstModel = result.steps[0]?.model

  return {
    question,
    answer: result.text.trim(),
    queries,
    steps: trace.length,
    trace,
    context: {
      provider: firstModel?.provider ?? null,
      model: firstModel?.modelId ?? null,
      tables: tables.length,
      startedAt: startedAt.toISOString(),
      durationMs: Date.now() - started,
    },
    usage: {
      inputTokens: Number(result.usage.inputTokens ?? 0) || 0,
      outputTokens: Number(result.usage.outputTokens ?? 0) || 0,
    },
  }
}
