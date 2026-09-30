import { useEffect, useState } from 'react'
import { useCategoryStore } from '@/services/category/category.store'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, GripVertical, X } from 'lucide-react'
import { EmojiPicker } from '@/components/ui/emoji-picker'
import { toast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { useListControls } from '@/components/ui/list-controls'
import type { ViewMode } from '@/components/ui/view-toggle'

export function CategoriesPage() {
  const categories = useCategoryStore((s) => s.categories)
  const fetch = useCategoryStore((s) => s.fetch)
  const create = useCategoryStore((s) => s.create)
  const update = useCategoryStore((s) => s.update)
  const remove = useCategoryStore((s) => s.remove)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', emoji: '', color: '#ff6b35' })
  const [view, setView] = useState<ViewMode>('table')
  const [pendingDelete, setPendingDelete] = useState<any>(null)

  useEffect(() => { fetch() }, [])

  const list = useListControls({
    items: categories,
    searchText: (c) => `${c.name} ${c.emoji}`,
  })

  const resetForm = () => { setForm({ name: '', emoji: '', color: '#ff6b35' }); setEditId(null); setShowForm(false) }

  const handleCreate = async () => {
    if (!form.name) return
    await create({ name: form.name, emoji: form.emoji || '📦', color: form.color })
    toast({ title: 'تم إنشاء القسم', description: form.name, variant: 'success' })
    resetForm()
  }

  const handleUpdate = async () => {
    if (!editId || !form.name) return
    await update(editId, { name: form.name, emoji: form.emoji, color: form.color })
    toast({ title: 'تم تحديث القسم', description: form.name, variant: 'success' })
    resetForm()
  }

  const handleDelete = async (c: any) => {
    await remove(c.id)
    toast({ title: 'تم حذف القسم', description: c.name, variant: 'success' })
  }

  const startEdit = (c: any) => {
    setEditId(c.id); setShowForm(false)
    setForm({ name: c.name, emoji: c.emoji, color: c.color || '#ff6b35' })
  }

  const columns: DataColumn<any>[] = [
    { key: 'emoji', label: '', render: (c) => <span className="text-xl">{c.emoji}</span> },
    { key: 'name', label: 'الاسم', headerClassName: 'text-center', render: (c) => <span className="font-bold">{c.name}</span> },
    { key: 'color', label: 'اللون', render: (c) => <div className="w-4 h-4 rounded-full" style={{ backgroundColor: c.color }} /> },
    { key: 'order', label: 'الترتيب', render: (c) => <span>#{c.sortOrder ?? ''}</span> },
    { key: 'actions', label: 'إجراءات', className: 'text-left', render: (c) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => startEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete(c)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ) },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">الأقسام ({categories.length})</h2>
        <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => { showForm ? resetForm() : setShowForm(true); setEditId(null) }}>
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showForm ? 'إغلاق' : 'إضافة قسم'}
        </Button>
      </div>

      {(showForm || editId) && (
        <div className="mx-5 mt-4 p-4 border-2 rounded-2xl bg-card space-y-3 animate-slide-up">
          <div className="grid grid-cols-3 gap-3">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم القسم" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none col-span-2" dir="rtl" />
            <EmojiPicker value={form.emoji} onChange={emoji => setForm(f => ({ ...f, emoji }))} />
          </div>
          <div className="flex gap-2">
            <input type="color" value={form.color} onChange={e => setForm(f => ({ ...f, color: e.target.value }))} className="w-10 h-10 rounded-lg border-0 cursor-pointer" />
            <Button className="flex-1 rounded-xl" onClick={editId ? handleUpdate : handleCreate}>{editId ? 'تحديث' : 'إضافة'}</Button>
            {editId && <Button variant="ghost" className="rounded-xl" onClick={resetForm}>إلغاء</Button>}
          </div>
        </div>
      )}

      <ListToolbar
        search={list.search}
        onSearchChange={(v) => { list.setSearch(v); list.setPage(1) }}
        searchPlaceholder="بحث عن قسم..."
        view={view}
        onViewChange={setView}
      />

      {view === 'table' ? (
        <div className="flex-1 p-5 overflow-auto">
          <DataTable
            columns={columns}
            data={list.items}
            keyExtractor={(c) => c.id}
          />
        </div>
      ) : (
        <div className="flex-1 p-5 space-y-2 overflow-y-auto">
          {list.items.map(cat => (
            <div key={cat.id} className="flex items-center gap-3 border-2 rounded-xl bg-card p-3">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
              <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
              <span className="text-2xl">{cat.emoji}</span>
              <span className="flex-1 font-bold text-sm">{cat.name}</span>
              <span className="text-xs text-muted-foreground">ترتيب: {categories.indexOf(cat) + 1}</span>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => startEdit(cat)}><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete(cat)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          ))}
          {list.items.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-10">لا توجد أقسام مطابقة</p>
          )}
        </div>
      )}

      <Pagination page={list.page} totalPages={list.totalPages} total={list.total} start={list.start} end={list.end} onPageChange={(p) => list.setPage(p)} />

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف القسم"
        description={pendingDelete ? `سيتم حذف «${pendingDelete.name}» نهائياً.` : undefined}
        onConfirm={() => { if (pendingDelete) { handleDelete(pendingDelete); setPendingDelete(null) } }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
