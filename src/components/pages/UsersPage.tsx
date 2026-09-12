import { useEffect, useState } from 'react'
import { useUserStore } from '@/services/user/user.store'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, Shield, User, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function UsersPage() {
  const users = useUserStore((s) => s.users)
  const fetch = useUserStore((s) => s.fetch)
  const create = useUserStore((s) => s.create)
  const update = useUserStore((s) => s.update)
  const remove = useUserStore((s) => s.remove)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', pin: '', role: 'cashier' })

  useEffect(() => { fetch() }, [])

  const resetForm = () => { setForm({ name: '', pin: '', role: 'cashier' }); setEditId(null); setShowForm(false) }

  const handleCreate = async () => {
    if (!form.name || !form.pin) return
    await create({ name: form.name, pin: form.pin, role: form.role as 'admin' | 'cashier' })
    resetForm()
  }

  const handleUpdate = async () => {
    if (!editId || !form.name) return
    const data: any = { name: form.name, role: form.role }
    if (form.pin) data.pin = form.pin
    await update(editId, data)
    resetForm()
  }

  const startEdit = (u: any) => {
    setEditId(u.id); setShowForm(false)
    setForm({ name: u.name, pin: '', role: u.role })
  }

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
          <div className="flex gap-2">
            <Button className="flex-1 rounded-xl" onClick={editId ? handleUpdate : handleCreate}>{editId ? 'تحديث' : 'إضافة'}</Button>
            {editId && <Button variant="ghost" className="rounded-xl" onClick={resetForm}>إلغاء</Button>}
          </div>
        </div>
      )}

      <div className="flex-1 p-5 space-y-2">
        {users.map(u => (
          <div key={u.id} className="flex items-center gap-4 border-2 rounded-xl bg-card p-4">
            <div className={cn("w-10 h-10 rounded-full flex items-center justify-center", u.role === 'admin' ? "bg-primary/10" : "bg-secondary")}>
              {u.role === 'admin' ? <Shield className="h-5 w-5 text-primary" /> : <User className="h-5 w-5 text-muted-foreground" />}
            </div>
            <div className="flex-1">
              <p className="font-bold text-sm">{u.name}</p>
              <p className="text-xs text-muted-foreground">{u.role === 'admin' ? 'مدير' : 'كاشير'}</p>
            </div>
            <span className={cn("text-[10px] font-bold rounded-full px-2.5 py-0.5", u.role === 'admin' ? "bg-primary/10 text-primary" : "bg-secondary text-muted-foreground")}>
              {u.role === 'admin' ? 'مدير' : 'كاشير'}
            </span>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => startEdit(u)}><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => remove(u.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </div>
    </div>
  )
}
