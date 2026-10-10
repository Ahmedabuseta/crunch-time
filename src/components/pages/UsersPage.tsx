import { useEffect, useState } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useUserStore } from '@/services/user/user.store'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, Shield, User, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { useListControls } from '@/components/ui/list-controls'
import { toast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import type { ViewMode } from '@/components/ui/view-toggle'
import { useIsAdmin } from '@/lib/use-is-admin'

const roleLabel = (role: string) => (role === 'admin' ? 'مدير' : 'كاشير')

export function UsersPage() {
  const users = useUserStore((s) => s.users)
  const isAdmin = useIsAdmin()
  const fetch = useUserStore((s) => s.fetch)
  const create = useUserStore((s) => s.create)
  const update = useUserStore((s) => s.update)
  const remove = useUserStore((s) => s.remove)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', pin: '', role: 'cashier' })
  const [view, setView] = useState<ViewMode>('table')
  const [roleFilter, setRoleFilter] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<any>(null)

  useEffect(() => { fetch() }, [])

  const list = useListControls({
    items: users,
    searchText: (u) => u.name,
    filter: (u) => !roleFilter || u.role === roleFilter,
  })

  const resetForm = () => { setForm({ name: '', pin: '', role: 'cashier' }); setEditId(null); setShowForm(false) }

  // Admin passwords must be complex — cashiers
  // keep their quick 4-digit PINs.
  const adminPinError = (pin: string): string | null => {
    if (pin.length < 8) return 'كلمة سر المدير لازم تكون 8 حروف أو أكثر'
    if (/^\d+$/.test(pin)) return 'كلمة سر المدير لازم تحتوي حروف، مش أرقام بس'
    return null
  }

  const handleCreate = async () => {
    if (!form.name || !form.pin) return
    if (form.role === 'admin') {
      const err = adminPinError(form.pin)
      if (err) { toast({ title: err, variant: 'error' }); return }
    }
    await create({ name: form.name, pin: form.pin, role: form.role as 'admin' | 'cashier' })
    toast({ title: 'تم إنشاء المستخدم', description: form.name, variant: 'success' })
    resetForm()
  }

  const handleUpdate = async () => {
    if (!editId || !form.name) return
    if (form.pin && form.role === 'admin') {
      const err = adminPinError(form.pin)
      if (err) { toast({ title: err, variant: 'error' }); return }
    }
    const data: any = { name: form.name, role: form.role }
    if (form.pin) data.pin = form.pin
    await update(editId, data)
    toast({ title: 'تم تحديث المستخدم', description: form.name, variant: 'success' })
    resetForm()
  }

  const handleDelete = async (u: any, opts?: { hard?: boolean }) => {
    await remove(u.id, opts)
    toast({ title: opts?.hard ? 'تم الحذف النهائي للمستخدم' : 'تم حذف المستخدم', description: u.name, variant: 'success' })
  }

  const startEdit = (u: any) => {
    setEditId(u.id); setShowForm(false)
    setForm({ name: u.name, pin: '', role: u.role })
  }

  const columns: DataColumn<any>[] = [
    {
      key: 'user', label: 'المستخدم', sortValue: (u: any) => u.name, render: (u) => (
        <div className="flex items-center gap-3">
          <div className={cn("w-8 h-8 rounded-full flex items-center justify-center shrink-0", u.role === 'admin' ? "bg-primary/10" : "bg-secondary")}>
            {u.role === 'admin' ? <Shield className="h-4 w-4 text-primary" /> : <User className="h-4 w-4 text-muted-foreground" />}
          </div>
          <span className="font-bold">{u.name}</span>
        </div>
      ),
    },
    {
      key: 'role', label: 'الصلاحية', sortValue: (u: any) => u.role, render: (u) => (
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
            <input
              value={form.pin}
              onChange={e => setForm(f => ({ ...f, pin: e.target.value }))}
              type={form.role === 'admin' ? 'password' : 'text'}
              inputMode={form.role === 'admin' ? 'text' : 'numeric'}
              placeholder={editId
                ? 'اتركه فارغ للاحتفاظ'
                : form.role === 'admin' ? 'كلمة سر المدير (8+ حروف)' : 'الرقم السري (4 أرقام)'}
              maxLength={form.role === 'admin' ? undefined : 4}
              className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center"
            />
          </div>
          {/* Role select */}
          <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
            <SelectTrigger className="w-full rounded-xl">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cashier">كاشير</SelectItem>
              <SelectItem value="admin">مدير</SelectItem>
            </SelectContent>
          </Select>
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
          <DataTable columns={columns} data={list.items} keyExtractor={(u) => u.id} sort={list.sort} onSortChange={list.setSort} />
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
                <p className="text-xs text-muted-foreground">{roleLabel(u.role)}</p>
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
        description={pendingDelete ? `سيتم تعطيل «${pendingDelete.name}» ومنع دخوله للنظام.` : undefined}
        allowHardDelete={isAdmin}
        hardDeleteDescription="يحذف المستخدم نهائياً. لن يمكن استرجاعه."
        onConfirm={({ hard }) => { if (pendingDelete) { handleDelete(pendingDelete, { hard }); setPendingDelete(null) } }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
