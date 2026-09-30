import { useEffect, useState } from 'react'
import { useUserStore } from '@/services/user/user.store'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, Shield, User, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { useListControls } from '@/components/ui/list-controls'
import { toast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { ViewMode } from '@/components/ui/view-toggle'

const roleLabel = (role: string) => (role === 'admin' ? 'مدير' : 'كاشير')

export function UsersPage() {
  const users = useUserStore((s) => s.users)
  const fetch = useUserStore((s) => s.fetch)
  const create = useUserStore((s) => s.create)
  const update = useUserStore((s) => s.update)
  const remove = useUserStore((s) => s.remove)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', pin: '', role: 'cashier', hourlyRate: '', commissionRate: '' })
  const [view, setView] = useState<ViewMode>('table')
  const [roleFilter, setRoleFilter] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<any>(null)

  useEffect(() => { fetch() }, [])

  const list = useListControls({
    items: users,
    searchText: (u) => u.name,
    filter: (u) => !roleFilter || u.role === roleFilter,
  })

  const resetForm = () => { setForm({ name: '', pin: '', role: 'cashier', hourlyRate: '', commissionRate: '' }); setEditId(null); setShowForm(false) }

  const handleCreate = async () => {
    if (!form.name || !form.pin) return
    await create({ name: form.name, pin: form.pin, role: form.role as 'admin' | 'cashier', hourlyRate: parseFloat(form.hourlyRate) || 0, commissionRate: parseFloat(form.commissionRate) || 0 })
    toast({ title: 'تم إنشاء المستخدم', description: form.name, variant: 'success' })
    resetForm()
  }

  const handleUpdate = async () => {
    if (!editId || !form.name) return
    const data: any = { name: form.name, role: form.role, hourlyRate: parseFloat(form.hourlyRate) || 0, commissionRate: parseFloat(form.commissionRate) || 0 }
    if (form.pin) data.pin = form.pin
    await update(editId, data)
    toast({ title: 'تم تحديث المستخدم', description: form.name, variant: 'success' })
    resetForm()
  }

  const handleDelete = async (u: any) => {
    await remove(u.id)
    toast({ title: 'تم حذف المستخدم', description: u.name, variant: 'success' })
  }

  const startEdit = (u: any) => {
    setEditId(u.id); setShowForm(false)
    setForm({ name: u.name, pin: '', role: u.role, hourlyRate: String(u.hourlyRate || ''), commissionRate: String(u.commissionRate || '') })
  }

  const columns: DataColumn<any>[] = [
    {
      key: 'user', label: 'المستخدم', render: (u) => (
        <div className="flex items-center gap-3">
          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", u.role === 'admin' ? "bg-primary/10" : "bg-secondary")}>
            {u.role === 'admin' ? <Shield className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-muted-foreground" />}
          </div>
          <span className="font-bold">{u.name}</span>
        </div>
      ),
    },
    {
      key: 'role', label: 'الصلاحية', render: (u) => (
        <span className={cn("text-[10px] font-bold rounded-full px-2.5 py-0.5", u.role === 'admin' ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>
          {roleLabel(u.role)}
        </span>
      ),
    },
    {
      key: 'actions', label: 'إجراءات', className: 'text-left', render: (u) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => startEdit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete(u)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">المستخدمين ({users.length})</h2>
        <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => { showForm ? resetForm() : setShowForm(true); setEditId(null) }}>
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showForm ? 'إغلاق' : 'إضافة مستخدم'}
        </Button>
      </div>

      {(showForm || editId) && (
        <div className="mx-5 mt-4 p-4 border-2 rounded-2xl bg-card space-y-3 animate-slide-up">
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="الاسم" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
            <input value={form.pin} onChange={e => setForm(f => ({ ...f, pin: e.target.value }))} placeholder={editId ? 'اتركه فارغ للاحتفاظ' : 'الرقم السري (4 أرقام)'} maxLength={4} className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" />
          </div>
          {/* Role select */}
          <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none">
            <option value="cashier">كاشير</option>
            <option value="admin">مدير</option>
          </select>
          {/* Pay fields */}
          <div className="grid grid-cols-2 gap-3">
            <input type="number" min="0" value={form.hourlyRate} onChange={e => setForm(f => ({ ...f, hourlyRate: e.target.value }))} placeholder="الأجر/ساعة (ج.م)" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
            <input type="number" min="0" max="100" value={form.commissionRate} onChange={e => setForm(f => ({ ...f, commissionRate: e.target.value }))} placeholder="العمولة (%)" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 rounded-xl" onClick={editId ? handleUpdate : handleCreate}>{editId ? 'تحديث' : 'إضافة'}</Button>
            {editId && <Button variant="ghost" className="rounded-xl" onClick={resetForm}>إلغاء</Button>}
          </div>
        </div>
      )}

      <ListToolbar
        search={list.search}
        onSearchChange={(v) => { list.setSearch(v); list.setPage(1) }}
        searchPlaceholder="بحث بالاسم..."
        view={view}
        onViewChange={setView}
        filters={[
          { value: null, label: 'الكل', count: users.length },
          { value: 'admin', label: 'مدير', count: users.filter(u => u.role === 'admin').length },
          { value: 'cashier', label: 'كاشير', count: users.filter(u => u.role === 'cashier').length },
        ]}
        filterValue={roleFilter}
        onFilterChange={(v) => { setRoleFilter(v); list.setPage(1) }}
      />

      {view === 'table' ? (
        <div className="flex-1 p-5 overflow-auto">
          <DataTable columns={columns} data={list.items} keyExtractor={(u) => u.id} />
        </div>
      ) : (
        <div className="flex-1 p-5 space-y-2 overflow-y-auto">
          {list.items.map(u => (
            <div key={u.id} className="flex items-center gap-4 border-2 rounded-xl bg-card p-4">
              <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", u.role === 'admin' ? "bg-primary/10" : "bg-secondary")}>
                {u.role === 'admin' ? <Shield className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-muted-foreground" />}
              </div>
              <div className="flex-1">
                <p className="font-bold text-sm">{u.name}</p>
                <p className="text-xs text-muted-foreground">{roleLabel(u.role)}
                  {((u.hourlyRate || 0) > 0 || (u.commissionRate || 0) > 0) && (
                    <span> · {(u.hourlyRate || 0) > 0 ? `${fmtMoney(u.hourlyRate!)} ج/س` : ''}{(u.hourlyRate || 0) > 0 && (u.commissionRate || 0) > 0 ? ' · ' : ''}{(u.commissionRate || 0) > 0 ? `${u.commissionRate}%` : ''}</span>
                  )}
                </p>
              </div>
              <span className={cn("text-[10px] font-bold rounded-full px-2.5 py-0.5", u.role === 'admin' ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>
                {roleLabel(u.role)}
              </span>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => startEdit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
<Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete(u)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
          {list.items.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-10">لا يوجد مستخدمون مطابقون</p>
          )}
        </div>
      )}

      <Pagination page={list.page} totalPages={list.totalPages} total={list.total} start={list.start} end={list.end} onPageChange={(p) => list.setPage(p)} />

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف المستخدم"
        description={pendingDelete ? `سيتم حذف «${pendingDelete.name}» نهائياً.` : undefined}
        onConfirm={() => { if (pendingDelete) { handleDelete(pendingDelete); setPendingDelete(null) } }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
