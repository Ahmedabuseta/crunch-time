import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Markdown } from '@/components/ui/markdown'
import { toast } from '@/components/ui/toast'
import { cn } from '@/lib/utils'
import {
  ChevronDown,
  ChevronLeft,
  Copy,
  Database,
  ListTree,
  Loader2,
  Play,
  RefreshCw,
  Search,
  Sparkles,
  Terminal,
} from 'lucide-react'

interface AnalysisColumn {
  name: string
  type: string
  notNull: boolean
  primaryKey: boolean
}

interface AnalysisTable {
  name: string
  columns: AnalysisColumn[]
}

interface QueryResult {
  columns: string[]
  rows: unknown[][]
  rowCount: number
  truncated: boolean
  elapsedMs: number
}

interface AskQuery extends QueryResult {
  sql: string
  purpose: string | null
  toolCallId: string | null
  error?: string
}

interface AskToolCall {
  id: string
  name: string
  args: unknown
}

interface AskToolResult {
  id: string
  name: string
  output: unknown
}

interface AskStep {
  index: number
  text: string
  reasoning: string | null
  finishReason: string | null
  toolCalls: AskToolCall[]
  toolResults: AskToolResult[]
  usage: { inputTokens: number; outputTokens: number; reasoningTokens: number }
}

interface AskContext {
  provider: string | null
  model: string | null
  tables: number
  startedAt: string
  durationMs: number
}

interface AskResult {
  question: string
  answer: string
  queries: AskQuery[]
  steps: number
  trace: AskStep[]
  context: AskContext
  usage: { inputTokens: number; outputTokens: number }
}

const DEFAULT_SQL = `SELECT status, COUNT(*) AS orders, ROUND(SUM(total), 2) AS revenue
FROM orders
GROUP BY status
ORDER BY orders DESC`

const EXAMPLES = [
  'إيه أكتر 5 أصناف مبيعاً الشهر ده؟',
  'قارن مبيعات النهاردة بأمس',
  'كام طلب اتلغي وإجمالي المبالغ؟',
  'إجمالي المبيعات لكل كاشير',
]

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message
  return String(error ?? 'خطأ غير متوقع')
}

function formatCell(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function ErrorBox({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[11px] leading-relaxed text-destructive">
      {message}
    </div>
  )
}

function ResultTable({ result }: { result: QueryResult }) {
  if (result.columns.length === 0) {
    return <p className="text-[11px] text-muted-foreground">الاستعلام مفيهوش أعمدة.</p>
  }

  return (
    <div className="max-h-[55vh] overflow-auto rounded-xl border" dir="ltr">
      <table className="w-full border-collapse font-mono text-[11px]">
        <thead className="sticky top-0 z-10 bg-secondary/95 backdrop-blur">
          <tr>
            {result.columns.map((column, index) => (
              <th
                key={`${column}-${index}`}
                className="whitespace-nowrap border-b border-border px-2.5 py-2 text-left font-bold"
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {result.rows.length === 0 ? (
            <tr>
              <td colSpan={result.columns.length} className="px-3 py-4 text-center text-muted-foreground">
                مفيش صفوف
              </td>
            </tr>
          ) : (
            result.rows.map((row, rowIndex) => (
              <tr key={rowIndex} className="transition-colors hover:bg-secondary/35">
                {row.map((cell, cellIndex) => (
                  <td
                    key={cellIndex}
                    className={cn(
                      'whitespace-nowrap border-b border-border/40 px-2.5 py-1.5',
                      (cell === null || cell === undefined) && 'text-muted-foreground',
                    )}
                  >
                    {formatCell(cell)}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  )
}

interface SqlToolOutput {
  ok: boolean
  columns?: string[]
  rows?: unknown[][]
  rowCount?: number
  truncated?: boolean
  elapsedMs?: number
  error?: string
}

function asSqlOutput(value: unknown): SqlToolOutput | null {
  if (!value || typeof value !== 'object') return null
  const output = value as SqlToolOutput
  return typeof output.ok === 'boolean' ? output : null
}

function TraceStep({ step, queries, last }: { step: AskStep; queries: AskQuery[]; last: boolean }) {
  return (
    <div className="px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex shrink-0 flex-col items-center self-stretch">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-[10px] font-black">
            {step.index + 1}
          </span>
          <span className="mt-1 w-px flex-1 bg-border" />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="rounded-full bg-secondary px-2 py-0.5 font-mono" dir="ltr">
              {step.finishReason || 'step'}
            </span>
            {last && (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 font-bold text-primary">الرد النهائي</span>
            )}
            <span>{step.usage.inputTokens} in · {step.usage.outputTokens} out</span>
            {step.usage.reasoningTokens > 0 && <span>{step.usage.reasoningTokens} reasoning</span>}
          </div>

          {step.text && <Markdown text={step.text} className="text-[12px]" />}

          {step.reasoning && (
            <details className="rounded-lg border border-border/60 bg-secondary/30">
              <summary className="cursor-pointer select-none px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground [&::-webkit-details-marker]:hidden">
                التفكير · {step.reasoning.length.toLocaleString('en-US')} حرف
              </summary>
              <pre
                dir="auto"
                className="max-h-48 overflow-auto whitespace-pre-wrap px-2.5 pb-2 text-[10px] leading-relaxed text-muted-foreground"
              >
                {step.reasoning}
              </pre>
            </details>
          )}

          {step.toolCalls.map((call) => {
            const result = step.toolResults.find((entry) => entry.id === call.id)
            const output = asSqlOutput(result?.output)
            const args = (call.args ?? {}) as { sql?: string; purpose?: string }
            const query = queries.find((entry) => entry.toolCallId === call.id)
              ?? queries.find((entry) => entry.sql === args.sql)

            return (
              <div key={call.id} className="overflow-hidden rounded-lg border bg-background/40">
                <div className="flex flex-wrap items-center gap-2 border-b border-border/60 bg-secondary/30 px-2.5 py-1.5">
                  <Terminal className="h-3 w-3 text-primary" />
                  <span className="font-mono text-[10px] font-bold" dir="ltr">{call.name}</span>
                  {args.purpose && (
                    <span className="truncate text-[10px] text-muted-foreground">{args.purpose}</span>
                  )}
                  <span className="ms-auto shrink-0 text-[10px] text-muted-foreground">
                    {output?.error
                      ? 'خطأ'
                      : `${query?.rowCount ?? output?.rowCount ?? 0} صف · ${query?.elapsedMs ?? output?.elapsedMs ?? 0}ms`}
                  </span>
                </div>

                <div className="space-y-2 p-2.5">
                  {args.sql && (
                    <pre
                      dir="ltr"
                      className="overflow-x-auto whitespace-pre-wrap rounded-md bg-secondary/50 p-2 font-mono text-[10px] leading-relaxed"
                    >
                      {args.sql}
                    </pre>
                  )}
                  {output?.error ? (
                    <p className="text-[11px] text-destructive">{output.error}</p>
                  ) : query ? (
                    <ResultTable result={query} />
                  ) : output && output.columns ? (
                    <ResultTable
                      result={{
                        columns: output.columns,
                        rows: output.rows ?? [],
                        rowCount: output.rowCount ?? 0,
                        truncated: output.truncated ?? false,
                        elapsedMs: output.elapsedMs ?? 0,
                      }}
                    />
                  ) : (
                    <pre
                      dir="ltr"
                      className="overflow-x-auto whitespace-pre-wrap rounded-md bg-secondary/50 p-2 font-mono text-[10px]"
                    >
                      {JSON.stringify(result?.output ?? null, null, 2)}
                    </pre>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

function TraceCard({ result }: { result: AskResult }) {
  const copyTrace = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(result, null, 2))
      toast({ title: 'تم نسخ التتبع', variant: 'success' })
    } catch {
      toast({ title: 'تعذر النسخ', variant: 'error' })
    }
  }

  return (
    <div className="overflow-hidden rounded-2xl border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
        <ListTree className="h-4 w-4 text-primary" />
        <span className="text-[11px] font-black">التتبع الكامل</span>
        <span className="text-[10px] text-muted-foreground">
          {result.trace.length} خطوة · {result.context.tables} جدول · {result.context.durationMs}ms
        </span>
        {result.context.model && (
          <span className="font-mono text-[9px] text-muted-foreground" dir="ltr">
            {result.context.provider ? `${result.context.provider} · ` : ''}
            {result.context.model}
          </span>
        )}
        <button
          type="button"
          onClick={() => void copyTrace()}
          className="ms-auto flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-[10px] font-bold text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          title="نسخ التتبع كـ JSON"
        >
          <Copy className="h-3 w-3" />
          <span className="max-sm:hidden">نسخ JSON</span>
        </button>
      </div>

      <div className="border-b bg-secondary/20 px-4 py-2 text-[11px] text-muted-foreground">
        <span className="font-bold text-foreground">السؤال:</span> {result.question}
      </div>

      <div className="divide-y divide-border/60">
        {result.trace.map((step) => (
          <TraceStep
            key={step.index}
            step={step}
            queries={result.queries}
            last={step.index === result.trace.length - 1}
          />
        ))}
      </div>
    </div>
  )
}

export function AnalysisPage() {
  const [tab, setTab] = useState<'ask' | 'sql'>('ask')
  const [question, setQuestion] = useState('')
  const [sql, setSql] = useState(DEFAULT_SQL)
  const [schema, setSchema] = useState<AnalysisTable[]>([])
  const [schemaError, setSchemaError] = useState<string | null>(null)
  const [schemaQuery, setSchemaQuery] = useState('')
  const [ask, setAsk] = useState<AskResult | null>(null)
  const [result, setResult] = useState<QueryResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [exampleKey, setExampleKey] = useState(0)

  const loadSchema = async () => {
    try {
      setSchema(await window.api.analysis.schema())
      setSchemaError(null)
    } catch (err) {
      setSchema([])
      setSchemaError(messageOf(err))
    }
  }

  useEffect(() => {
    void loadSchema()
  }, [])

  const filteredTables = useMemo(() => {
    const needle = schemaQuery.trim().toLowerCase()
    if (!needle) return schema
    return schema.filter(
      (table) =>
        table.name.toLowerCase().includes(needle) ||
        table.columns.some((column) => column.name.toLowerCase().includes(needle)),
    )
  }, [schema, schemaQuery])

  const refreshSnapshot = async () => {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await window.api.analysis.refresh()
      await loadSchema()
      toast({ title: 'نسخة جديدة جاهزة', variant: 'success' })
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const runAsk = async () => {
    if (busy || !question.trim()) return
    setBusy(true)
    setError(null)
    setAsk(null)
    try {
      setAsk(await window.api.analysis.ask(question.trim()))
    } catch (err) {
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const runSql = async () => {
    if (busy || !sql.trim()) return
    setBusy(true)
    setError(null)
    try {
      setResult(await window.api.analysis.query(sql))
    } catch (err) {
      setResult(null)
      setError(messageOf(err))
    } finally {
      setBusy(false)
    }
  }

  const queryTable = (name: string) => {
    setSql(`SELECT * FROM "${name.replace(/"/g, '""')}" LIMIT 50`)
    setResult(null)
    setError(null)
    setTab('sql')
  }

  const applyExample = (value: string) => {
    setQuestion(value)
    setTab('ask')
    setExampleKey((key) => key + 1)
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between gap-3 border-b px-5 py-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-black">
            <Database className="h-4 w-4 text-primary" />
            تحليل البيانات
          </h2>
          <p className="mt-0.5 text-[11px] text-muted-foreground">SQL على نسخة قراءة فقط — أي تعديل مرفوض</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden items-center gap-1 rounded-full bg-secondary px-2.5 py-1 text-[10px] font-bold text-muted-foreground sm:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-green-500" />
            قراءة فقط
          </span>
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 rounded-xl"
            disabled={busy}
            onClick={() => void refreshSnapshot()}
          >
            <RefreshCw className={cn('h-3.5 w-3.5', busy && 'animate-spin')} />
            <span className="max-sm:hidden">نسخة جديدة</span>
          </Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <Tabs
          value={tab}
          onValueChange={(value) => setTab(value as 'ask' | 'sql')}
          className="flex min-w-0 flex-1 flex-col gap-0"
        >
          <div className="flex shrink-0 items-center gap-2 border-b px-5 py-3">
            <TabsList className="h-9 w-auto">
              <TabsTrigger value="ask" className="gap-1.5">
                <Sparkles className="h-3.5 w-3.5" />
                اسأل
              </TabsTrigger>
              <TabsTrigger value="sql" className="gap-1.5">
                <Terminal className="h-3.5 w-3.5" />
                SQL
              </TabsTrigger>
            </TabsList>

            <div className="flex-1" />

            <div className="hidden sm:block">
              <Select key={exampleKey} onValueChange={applyExample}>
                <SelectTrigger className="h-8 w-[170px] rounded-lg bg-secondary text-[11px] font-bold">
                  <SelectValue placeholder="أمثلة" />
                </SelectTrigger>
                <SelectContent>
                  {EXAMPLES.map((example) => (
                    <SelectItem key={example} value={example}>
                      {example}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <TabsContent value="ask" className="mt-0 min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-4 p-5">
              <div className="flex items-center gap-2">
                <input
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey) {
                      event.preventDefault()
                      void runAsk()
                    }
                  }}
                  placeholder="اسأل عن أرقامك… مثال: إيه أكتر 5 أصناف مبيعاً الشهر ده؟"
                  className="min-h-[44px] flex-1 rounded-xl border-0 bg-secondary px-4 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  dir="rtl"
                />
                <Button
                  className="min-h-[44px] gap-1.5 rounded-xl"
                  disabled={busy || !question.trim()}
                  onClick={() => void runAsk()}
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                  <span className="max-sm:hidden">حلّل</span>
                </Button>
              </div>

              {error && <ErrorBox message={error} />}

              {!ask && !busy && (
                <div className="rounded-2xl border border-dashed border-border px-6 py-10 text-center">
                  <Database className="mx-auto h-8 w-8 text-muted-foreground/40" />
                  <p className="mt-3 text-sm font-bold">اسأل عن أرقامك بالعربي</p>
                  <p className="mx-auto mt-1 max-w-md text-[11px] leading-relaxed text-muted-foreground">
                    المحلل بيكتب SQL بنفسه على نسخة للقراءة، وبيعرضلك كل استعلام شغّله مع نتيجته.
                  </p>
                </div>
              )}

              {busy && !ask && (
                <div className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  بيفكر ويجمع الأرقام…
                </div>
              )}

              {ask && (
                <>
                  <div className="rounded-2xl border bg-card p-4">
                    <div className="mb-2 flex items-center gap-2">
                      <Sparkles className="h-4 w-4 text-primary" />
                      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">الإجابة</span>
                    </div>
                    {ask.answer
                      ? <Markdown text={ask.answer} />
                      : <p className="text-sm text-muted-foreground">مفيش إجابة — جرّب تعيد صياغة السؤال.</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                      <span>{ask.queries.length} استعلام</span>
                      <span>{ask.steps} خطوة</span>
                      <span>{ask.usage.inputTokens + ask.usage.outputTokens} توكن</span>
                    </div>
                  </div>

                  {ask.trace.length > 0
                    ? <TraceCard result={ask} />
                    : ask.queries.map((entry, index) => (
                    <details
                      key={`${index}-${entry.sql.slice(0, 24)}`}
                      open={index === 0}
                      className="overflow-hidden rounded-xl border bg-card"
                    >
                      <summary className="flex cursor-pointer select-none items-center gap-2 px-3 py-2.5 hover:bg-secondary/40 [&::-webkit-details-marker]:hidden">
                        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                        <span className="shrink-0 text-[11px] font-bold">استعلام {index + 1}</span>
                        {entry.purpose && (
                          <span className="truncate text-[10px] text-muted-foreground">{entry.purpose}</span>
                        )}
                        <span className="ms-auto shrink-0 text-[10px] text-muted-foreground">
                          {entry.error ? 'خطأ' : `${entry.rowCount} صف · ${entry.elapsedMs}ms`}
                        </span>
                      </summary>
                      <div className="space-y-2 border-t border-border p-3">
                        <pre
                          dir="ltr"
                          className="overflow-x-auto whitespace-pre-wrap rounded-lg bg-secondary/60 p-2.5 font-mono text-[11px] leading-relaxed"
                        >
                          {entry.sql}
                        </pre>
                        {entry.error ? (
                          <p className="text-xs text-destructive">{entry.error}</p>
                        ) : (
                          <ResultTable result={entry} />
                        )}
                      </div>
                    </details>
                  ))}
                </>
              )}
            </div>
          </TabsContent>

          <TabsContent value="sql" className="mt-0 min-h-0 flex-1 overflow-y-auto">
            <div className="space-y-3 p-5">
              <div className="overflow-hidden rounded-xl border bg-card">
                <div className="flex items-center justify-between border-b bg-secondary/40 px-3 py-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">استعلام SQL</span>
                  <span className="font-mono text-[9px] text-muted-foreground">Ctrl/⌘ + Enter</span>
                </div>
                <textarea
                  value={sql}
                  onChange={(event) => setSql(event.target.value)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                      event.preventDefault()
                      void runSql()
                    }
                  }}
                  spellCheck={false}
                  dir="ltr"
                  className="max-h-[42vh] min-h-[150px] w-full resize-y bg-transparent p-3 font-mono text-[12px] leading-relaxed outline-none"
                />
                <div className="flex items-center gap-2 border-t px-3 py-2">
                  <Button
                    size="sm"
                    className="gap-1.5 rounded-lg"
                    disabled={busy || !sql.trim()}
                    onClick={() => void runSql()}
                  >
                    {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />}
                    نفّذ
                  </Button>
                  <Button variant="ghost" size="sm" className="rounded-lg" disabled={busy} onClick={() => setSql(DEFAULT_SQL)}>
                    مثال
                  </Button>
                  <span className="ms-auto text-[10px] text-muted-foreground">SELECT / WITH فقط · 200 صف كحد أقصى</span>
                </div>
              </div>

              {error && <ErrorBox message={error} />}

              {result && (
                <div className="space-y-2">
                  <div className="flex items-center gap-3 px-1 text-[10px] text-muted-foreground">
                    <span>{result.rowCount} صف</span>
                    <span>{result.elapsedMs}ms</span>
                    {result.truncated && <span className="text-yellow-500">النتيجة مقطوعة</span>}
                  </div>
                  <ResultTable result={result} />
                </div>
              )}

              {!result && !busy && !error && (
                <p className="px-1 text-[11px] text-muted-foreground">
                  اكتب استعلام SELECT أو WITH على نسخة القراءة. الكتابة ممنوعة.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>

        <aside className="hidden w-[250px] shrink-0 flex-col border-r bg-card/40 xl:flex">
          <div className="flex shrink-0 items-center justify-between border-b px-3 py-2">
            <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              الجداول ({filteredTables.length})
            </span>
            <button
              type="button"
              onClick={() => void loadSchema()}
              className="cursor-pointer p-1 text-muted-foreground transition-colors hover:text-foreground"
              title="تحديث المخطط"
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>

          <div className="shrink-0 p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute right-2 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                value={schemaQuery}
                onChange={(event) => setSchemaQuery(event.target.value)}
                placeholder="بحث في الجداول…"
                dir="rtl"
                className="min-h-[34px] w-full rounded-lg border-0 bg-secondary pl-2 pr-7 text-[11px] focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          <ScrollArea className="min-h-0 flex-1 px-2 pb-3">
            {schemaError ? (
              <p className="px-2 py-4 text-center text-[10px] text-muted-foreground">{schemaError}</p>
            ) : filteredTables.length === 0 ? (
              <p className="px-2 py-4 text-center text-[10px] text-muted-foreground">
                {schema.length === 0 ? 'المخطط غير متاح في المتصفح' : 'مفيش جدول مطابق'}
              </p>
            ) : (
              filteredTables.map((table) => (
                <details key={table.name} className="group rounded-lg hover:bg-secondary/30">
                  <summary className="flex cursor-pointer select-none items-center gap-1.5 rounded-md px-2 py-1.5 [&::-webkit-details-marker]:hidden">
                    <ChevronLeft className="h-3 w-3 text-muted-foreground transition-transform group-open:-rotate-90" />
                    <span className="truncate font-mono text-[11px] font-bold" dir="ltr">
                      {table.name}
                    </span>
                    <span className="ms-auto text-[9px] text-muted-foreground">{table.columns.length}</span>
                  </summary>
                  <div className="pb-1">
                    {table.columns.map((column) => (
                      <div key={column.name} className="flex items-center gap-2 px-5 py-0.5 text-[10px]">
                        <span className="truncate font-mono" dir="ltr">
                          {column.name}
                        </span>
                        <span className="ms-auto shrink-0 font-mono text-muted-foreground" dir="ltr">
                          {column.type || 'TEXT'}
                          {column.primaryKey ? ' PK' : ''}
                        </span>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => queryTable(table.name)}
                      className="mx-4 mb-1.5 mt-1 cursor-pointer rounded-md bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary transition-colors hover:bg-primary/20"
                    >
                      استعلام
                    </button>
                  </div>
                </details>
              ))
            )}
          </ScrollArea>
        </aside>
      </div>
    </div>
  )
}
