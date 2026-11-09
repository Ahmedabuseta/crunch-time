// The audit log screen: who changed what, with before/after.
//
// The log has existed since migration 008 but was only reachable over the phone
// server's `/audit` route — nothing in the desktop app could show it, which made
// it useless for the person most likely to need it: the owner on the shop PC.
//
// Two kinds of row appear here, and they are deliberately different:
//  • Named actions (`product.create`, `order.refund`) written by the backend or
//    the HTTP route, which carry a device label.
//  • Table triggers (`create`, `update`) written by the database for every
//    write, including the ones no code remembered to instrument.
// Neither is filtered out: the specific action explains the intent, the trigger
// proves it happened.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { DatePicker } from '@/components/ui/date-picker'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { SearchInput } from '@/components/ui/search-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import { today, monthStart } from '@/lib/dates'
import { History, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react'

interface AuditRow {
  id: string
  userId: string | null
  deviceLabel: string | null
  action: string
  entity: string
  entityId: string | null
  before: string | null
  after: string | null
  createdAt: string
}

/** Arabic names for the tables an owner actually recognises. */
const ENTITY_LABELS: Record<string, string> = {
  products: 'صنف',
  categories: 'قسم',
  ingredients: 'مادة',
  recipes: 'وصفة',
  sub_recipes: 'وصفة فرعية',
  orders: 'طلب',
  order_items: 'سطر طلب',
  users: 'مستخدم',
  shifts: 'وردية',
  cash_movements: 'حركة درج',
  expenses: 'مصروف',
  settings: 'إعدادات',
  addons: 'إضافة',
  modifiers: 'موديفاير',
  modifier_groups: 'مجموعة خيارات',
  discount_codes: 'كود خصم',
  delivery_zones: 'منطقة توصيل',
  delivery_profiles: 'سائق',
  customers: 'عميل',
  payments: 'دفعة',
  inventory_transactions: 'حركة مخزون',
  purchase_price_history: 'تاريخ سعر شراء',
  product_addons: 'ربط إضافة',
  product_modifier_groups: 'ربط خيارات',
  kitchen_stations: 'محطة طباعة',
  station_categories: 'ربط محطة',
}

const ACTION_LABELS: Record<string, string> = {
  create: 'إنشاء',
  update: 'تعديل',
}

const entityLabel = (entity: string) => ENTITY_LABELS[entity] ?? entity
const actionLabel = (action: string) => ACTION_LABELS[action] ?? action.replace(/\./g, ' · ')

/** The columns that actually changed between the two snapshots. */
function changedFields(before: string | null, after: string | null): string[] {
  if (!before || !after) return []
  try {
    const a = JSON.parse(before) as Record<string, unknown>
    const b = JSON.parse(after) as Record<string, unknown>
    return Object.keys(b).filter((key) => JSON.stringify(a[key]) !== JSON.stringify(b[key]))
  } catch {
    return []
  }
}

/** A value as a short, readable line — money and numbers included. */
function preview(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const PAGE_SIZE = 25

export function AuditPage() {
  const [rows, setRows] = useState<AuditRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [entity, setEntity] = useState<string>('__all__')
  const [action, setAction] = useState<string>('__all__')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [page, setPage] = useState(0)
  const [expanded, setExpanded] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      // The filter is applied here rather than server-side so switching a
      // dropdown is instant: a month of changes is a few hundred rows, and one
      // read covers every filter combination the owner will try.
      const data = await window.api.audit.list({ from, to, limit: 1000 })
      setRows((data ?? []) as AuditRow[])
      setPage(0)
    } catch (err: any) {
      setError(String(err?.message ?? 'تعذّر تحميل السجل'))
    } finally {
      setLoading(false)
    }
  }, [from, to])

  useEffect(() => { void load() }, [load])

  const entities = useMemo(() => [...new Set(rows.map((row) => row.entity))].sort(), [rows])
  const actions = useMemo(() => [...new Set(rows.map((row) => row.action))].sort(), [rows])

  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return rows.filter((row) => {
      if (entity !== '__all__' && row.entity !== entity) return false
      if (action !== '__all__' && row.action !== action) return false
      if (!needle) return true
      return `${row.entity} ${row.entityId ?? ''} ${row.userId ?? ''} ${row.action}`.toLowerCase().includes(needle)
    })
  }, [rows, entity, action, search])

  const visible = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))

  const columns: DataColumn<AuditRow>[] = [
    {
      key: 'createdAt',
      label: 'الوقت',
      sortValue: (row) => row.createdAt,
      render: (row) => <span className="num text-[11px]">{row.createdAt.slice(0, 19).replace('T', ' ')}</span>,
    },
    {
      key: 'entity',
      label: 'الجدول',
      sortValue: (row) => entityLabel(row.entity),
      render: (row) => (
        <div>
          <span className="text-xs font-bold">{entityLabel(row.entity)}</span>
          <span className="block text-[10px] text-muted-foreground num" dir="ltr">{row.entity}</span>
        </div>
      ),
    },
    {
      key: 'action',
      label: 'العملية',
      sortValue: (row) => row.action,
      render: (row) => (
        <span
          className={cn(
            'text-[10px] font-bold px-2 py-0.5 rounded',
            row.action === 'create'
              ? 'bg-green-500/10 text-green-600'
              : row.action === 'update'
                ? 'bg-amber-500/10 text-amber-600'
                : 'bg-secondary text-muted-foreground',
          )}
        >
          {actionLabel(row.action)}
        </span>
      ),
    },
    {
      key: 'entityId',
      label: 'المعرّف',
      render: (row) => <span className="num text-[10px] text-muted-foreground" dir="ltr">{row.entityId ?? '—'}</span>,
    },
    {
      key: 'userId',
      label: 'بواسطة',
      sortValue: (row) => row.userId ?? '',
      render: (row) => (
        <span className="text-[11px]">
          {row.userId ?? <span className="text-muted-foreground">النظام</span>}
          {row.deviceLabel ? <span className="block text-[10px] text-muted-foreground" dir="ltr">{row.deviceLabel}</span> : null}
        </span>
      ),
    },
    {
      key: 'changes',
      label: 'التغييرات',
      render: (row) => {
        const fields = changedFields(row.before, row.after)
        const open = expanded === row.id
        return (
          <div>
            {fields.length > 0 ? (
              <span className="text-[11px] text-muted-foreground">
                {fields.slice(0, 4).join('، ')}{fields.length > 4 ? `… +${fields.length - 4}` : ''}
              </span>
            ) : (
              <span className="text-[11px] text-muted-foreground">{row.before ? '—' : 'سطر جديد'}</span>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-1 text-[10px] gap-1"
              onClick={() => setExpanded(open ? null : row.id)}
            >
              {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
              {open ? 'إخفاء' : 'تفاصيل'}
            </Button>
            {open ? (
              <div className="mt-1 max-h-44 overflow-auto rounded bg-secondary/40 p-2 space-y-0.5">
                {Object.keys({ ...safeParse(row.before), ...safeParse(row.after) }).map((field) => {
                  const before = safeParse(row.before)[field]
                  const after = safeParse(row.after)[field]
                  const same = JSON.stringify(before) === JSON.stringify(after)
                  return (
                    <div key={field} className={cn('text-[10px] flex gap-2', same && 'opacity-50')}>
                      <span className="font-bold num shrink-0" dir="ltr">{field}</span>
                      {same ? (
                        <span className="text-muted-foreground truncate">{preview(after)}</span>
                      ) : (
                        <span className="truncate">
                          <span className="text-red-500 line-through">{preview(before)}</span>
                          <span className="text-green-600"> → {preview(after)}</span>
                        </span>
                      )}
                    </div>
                  )
                })}
              </div>
            ) : null}
          </div>
        )
      },
    },
  ]

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-black">سجل التغييرات</h2>
          <span className="text-[11px] text-muted-foreground num">{filtered.length} سطر</span>
        </div>
        <Button variant="outline" size="sm" onClick={() => void load()} disabled={loading}>
          <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          تحديث
        </Button>
      </div>

      {/* One compact row of controls, not a stack of chips. */}
      <div className="flex items-center gap-2 flex-wrap">
        <SearchInput value={search} onChange={setSearch} placeholder="بحث في السجل…" className="w-56" />

        <Select value={entity} onValueChange={(value) => { setEntity(value); setPage(0) }}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="كل الجداول" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">كل الجداول</SelectItem>
            {entities.map((name) => (
              <SelectItem key={name} value={name}>{entityLabel(name)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={action} onValueChange={(value) => { setAction(value); setPage(0) }}>
          <SelectTrigger className="w-40 h-9"><SelectValue placeholder="كل العمليات" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__all__">كل العمليات</SelectItem>
            {actions.map((name) => (
              <SelectItem key={name} value={name}>{actionLabel(name)}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-1.5">
          <DatePicker value={from} onChange={setFrom} />
          <span className="text-[11px] text-muted-foreground">إلى</span>
          <DatePicker value={to} onChange={setTo} />
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600">{error}</div>
      ) : null}

      <div className="flex-1 min-h-0 overflow-auto">
        <DataTable
          columns={columns}
          data={visible}
          keyExtractor={(row) => row.id}
          emptyText={loading ? 'بيحمّل…' : 'مفيش تغييرات في المدة دي'}
          onRowClick={(row) => setExpanded(expanded === row.id ? null : row.id)}
        />
      </div>

      <Pagination
        page={page}
        totalPages={totalPages}
        total={filtered.length}
        start={filtered.length === 0 ? 0 : page * PAGE_SIZE + 1}
        end={Math.min(filtered.length, (page + 1) * PAGE_SIZE)}
        pageSize={PAGE_SIZE}
        onPageChange={setPage}
      />
    </div>
  )
}

function safeParse(value: string | null): Record<string, unknown> {
  if (!value) return {}
  try {
    return JSON.parse(value) as Record<string, unknown>
  } catch {
    return {}
  }
}
