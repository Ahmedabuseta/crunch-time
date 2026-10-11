import { useEffect, useState } from 'react'
import { useAddonStore } from '@/services/addon/addon.store'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { RecipePanel } from './RecipePanel'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, X, Link } from 'lucide-react'
import { EmojiPicker } from '@/components/ui/emoji-picker'
import { toast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { fmtMoney } from '@/lib/format'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { useListControls } from '@/components/ui/list-controls'
import type { ViewMode } from '@/components/ui/view-toggle'
import { useIsAdmin } from '@/lib/use-is-admin'
import { Emoji } from '@/components/Emoji'

export function AddonsPage() {
  const addons = useAddonStore((s) => s.addons)
  const isAdmin = useIsAdmin()
  const fetch = useAddonStore((s) => s.fetch)
  const create = useAddonStore((s) => s.create)
  const update = useAddonStore((s) => s.update)
  const remove = useAddonStore((s) => s.remove)
  const ingredients = useInventoryStore((s) => s.ingredients)
  const fetchIngredients = useInventoryStore((s) => s.fetchIngredients)
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', emoji: '', price: '' })
  const [recipeFor, setRecipeFor] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('table')
  const [pendingDelete, setPendingDelete] = useState<any>(null)

  useEffect(() => { fetch(); fetchIngredients() }, [])

  const list = useListControls({
    items: addons,
    searchText: (a) => `${a.name} ${a.emoji}`,
  })

  const resetForm = () => { setForm({ name: '', emoji: '', price: '' }); setEditId(null); setShowForm(false) }

  const handleCreate = async () => {
    if (!form.name || !form.price) return
    await create({ name: form.name, emoji: form.emoji || '➕', price: parseFloat(form.price) })
    toast({ title: 'تم إنشاء الإضافة', description: form.name, variant: 'success' })
    resetForm()
  }

  const handleUpdate = async () => {
    if (!editId || !form.name) return
    await update(editId, { name: form.name, emoji: form.emoji, price: parseFloat(form.price) })
    toast({ title: 'تم تحديث الإضافة', description: form.name, variant: 'success' })
    resetForm()
  }

  const handleDelete = async (a: any, opts?: { hard?: boolean }) => {
    await remove(a.id, opts)
    toast({ title: opts?.hard ? 'تم الحذف النهائي للإضافة' : 'تم حذف الإضافة', description: a.name, variant: 'success' })
  }

  const startEdit = (a: any) => {
    setEditId(a.id); setShowForm(false)
    setForm({ name: a.name, emoji: a.emoji, price: String(a.price) })
  }

  const columns: DataColumn<any>[] = [
    { key: 'name', label: 'الإضافة', render: (a) => <div className="flex items-center gap-2"><Emoji className="text-xl">{a.emoji}</Emoji><span className="font-bold">{a.name}</span></div> },
    { key: 'price', label: 'السعر', render: (a) => <span className="font-black text-primary">{fmtMoney(a.price)} ج.م</span> },
    {
      key: 'actions', label: 'إجراءات', className: 'text-left', render: (a) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setRecipeFor(recipeFor === a.id ? null : a.id)}><Link className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => startEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete(a)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">الإضافات ({addons.length})</h2>
        <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => { showForm ? resetForm() : setShowForm(true); setEditId(null) }}>
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showForm ? 'إغلاق' : 'إضافة'}
        </Button>
      </div>

      {(showForm || editId) && (
        <div className="mx-5 mt-4 p-4 border-2 rounded-2xl bg-card space-y-3 animate-slide-up">
          <div className="grid grid-cols-3 gap-3">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الإضافة" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none col-span-2" dir="rtl" />
            <EmojiPicker value={form.emoji} onChange={emoji => setForm(f => ({ ...f, emoji }))} />
          </div>
          <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="السعر (ج.م)" className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
          <div className="flex gap-2">
            <Button className="flex-1 rounded-xl" onClick={editId ? handleUpdate : handleCreate}>{editId ? 'تحديث' : 'إضافة'}</Button>
            {editId && <Button variant="ghost" className="rounded-xl" onClick={resetForm}>إلغاء</Button>}
          </div>
        </div>
      )}

      <ListToolbar
        search={list.search}
        onSearchChange={(v) => { list.setSearch(v); list.setPage(1) }}
        searchPlaceholder="بحث عن إضافة..."
        view={view}
        onViewChange={setView}
      />

      {view === 'table' ? (
        <div className="flex-1 p-5 overflow-auto">
          <DataTable columns={columns} data={list.items} keyExtractor={(a) => a.id} sort={list.sort} onSortChange={list.setSort} />
        </div>
      ) : (
        <div className="flex-1 p-5 grid grid-cols-2 lg:grid-cols-4 gap-3 overflow-y-auto content-start">
          {list.items.map(a => (
            <div key={a.id} className="border-2 rounded-2xl bg-card p-4 flex flex-col items-center gap-2">
              <Emoji className="text-3xl">{a.emoji}</Emoji>
              <p className="font-bold text-sm">{a.name}</p>
              <p className="font-black text-primary text-sm">{fmtMoney(a.price)} ج.م</p>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setRecipeFor(recipeFor === a.id ? null : a.id)}><Link className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => startEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete(a)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
          {list.items.length === 0 && (
            <p className="col-span-full text-center text-xs text-muted-foreground py-10">لا توجد إضافات مطابقة</p>
          )}
        </div>
      )}

      {recipeFor && (
        <div className="px-5 pb-5">
          <div className="border-2 rounded-2xl bg-card p-4 animate-slide-up">
            <RecipePanel
              title={`وصفة الإضافة — ${addons.find(a => a.id === recipeFor)?.name}`}
              targetId={recipeFor}
              entityField="addonId"
              ingredients={ingredients}
              fetchRecipes={(id) => window.api.addon.listRecipes(id)}
              upsertRecipe={async (data) => (await window.api.addon.upsertRecipe(data) as { id: string }).id}
              deleteRecipe={(id) => window.api.addon.deleteRecipe(id)}
            />
          </div>
        </div>
      )}

      <Pagination page={list.page} totalPages={list.totalPages} total={list.total} start={list.start} end={list.end} onPageChange={(p) => list.setPage(p)} />

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف الإضافة"
        description={pendingDelete ? `سيتم تعطيل «${pendingDelete.name}» وإخفاؤه من قوائم البيع.` : undefined}
        allowHardDelete={isAdmin}
        hardDeleteDescription="يحذف الإضافة ووصفاتها نهائياً. لن يمكن استرجاعه."
        onConfirm={({ hard }) => { if (pendingDelete) { handleDelete(pendingDelete, { hard }); setPendingDelete(null) } }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
