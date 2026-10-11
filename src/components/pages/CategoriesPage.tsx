import { useEffect, useMemo, useState } from 'react'
import { useCategoryStore } from '@/services/category/category.store'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, GripVertical, X, ChevronUp, ChevronDown } from 'lucide-react'
import { EmojiPicker } from '@/components/ui/emoji-picker'
import { toast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { useListControls } from '@/components/ui/list-controls'
import type { ViewMode } from '@/components/ui/view-toggle'
import { useIsAdmin } from '@/lib/use-is-admin'
import { cn } from '@/lib/utils'
import { Emoji } from '@/components/Emoji'

export function CategoriesPage() {
  const categories = useCategoryStore((s) => s.categories)
  const isAdmin = useIsAdmin()
  const fetch = useCategoryStore((s) => s.fetch)
  const create = useCategoryStore((s) => s.create)
  const update = useCategoryStore((s) => s.update)
  const remove = useCategoryStore((s) => s.remove)
  const reorder = useCategoryStore((s) => s.reorder)

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', emoji: '', color: '#ff6b35', sortOrder: 1 })
  const [view, setView] = useState<ViewMode>('cards')
  const [pendingDelete, setPendingDelete] = useState<any>(null)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dragOverId, setDragOverId] = useState<string | null>(null)

  useEffect(() => { fetch() }, [])

  const sortedCategories = useMemo(() => {
    return [...categories].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
  }, [categories])

  const list = useListControls({
    items: sortedCategories,
    searchText: (c) => `${c.name} ${c.emoji}`,
    pageSize: 100,
  })

  const resetForm = () => {
    setForm({ name: '', emoji: '', color: '#ff6b35', sortOrder: sortedCategories.length + 1 })
    setEditId(null)
    setShowForm(false)
  }

  const openAddForm = () => {
    setEditId(null)
    setForm({ name: '', emoji: '', color: '#ff6b35', sortOrder: sortedCategories.length + 1 })
    setShowForm(true)
  }

  const handleMove = async (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0) return
    if (fromIndex >= sortedCategories.length || toIndex >= sortedCategories.length) return

    const next = [...sortedCategories]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)

    try {
      await reorder(next.map(c => c.id))
      toast({
        title: 'تم حفظ الترتيب الجديد',
        description: `«${moved.name}» أصبحت في الترتيب #${toIndex + 1}`,
        variant: 'success'
      })
    } catch (err: any) {
      toast({ title: 'فشل تغيير الترتيب', description: err?.message || 'حدث خطأ أثناء حفظ الترتيب', variant: 'error' })
    }
  }

  const handleSetOrder = async (catId: string, newOrder: number) => {
    const fromIndex = sortedCategories.findIndex(c => c.id === catId)
    if (fromIndex === -1) return
    const toIndex = Math.max(0, Math.min(sortedCategories.length - 1, newOrder - 1))
    if (fromIndex === toIndex) return
    await handleMove(fromIndex, toIndex)
  }

  const handleCreate = async () => {
    if (!form.name) return
    const targetOrder = Math.max(1, form.sortOrder || (sortedCategories.length + 1))
    const newId = await create({
      name: form.name,
      emoji: form.emoji || '📦',
      color: form.color,
      sortOrder: targetOrder,
    })

    if (targetOrder <= sortedCategories.length) {
      const listCopy = sortedCategories.map(c => c.id)
      listCopy.splice(targetOrder - 1, 0, newId)
      await reorder(listCopy)
    }

    toast({ title: 'تم إنشاء القسم', description: form.name, variant: 'success' })
    resetForm()
  }

  const handleUpdate = async () => {
    if (!editId || !form.name) return
    await update(editId, { name: form.name, emoji: form.emoji, color: form.color })

    const oldIndex = sortedCategories.findIndex(c => c.id === editId)
    const targetIndex = Math.max(0, Math.min(sortedCategories.length - 1, (form.sortOrder || 1) - 1))
    if (oldIndex !== -1 && oldIndex !== targetIndex) {
      await handleMove(oldIndex, targetIndex)
    }

    toast({ title: 'تم تحديث القسم', description: form.name, variant: 'success' })
    resetForm()
  }

  const handleDelete = async (c: any, opts?: { hard?: boolean }) => {
    await remove(c.id, opts)
    toast({ title: opts?.hard ? 'تم الحذف النهائي للقسم' : 'تم حذف القسم', description: c.name, variant: 'success' })
  }

  const startEdit = (c: any) => {
    const currentRank = sortedCategories.findIndex(x => x.id === c.id) + 1
    setEditId(c.id)
    setShowForm(false)
    setForm({
      name: c.name,
      emoji: c.emoji,
      color: c.color || '#ff6b35',
      sortOrder: c.sortOrder ?? currentRank,
    })
  }

  const columns: DataColumn<any>[] = [
    {
      key: 'order',
      label: 'الترتيب',
      render: (c) => {
        const idx = sortedCategories.findIndex(x => x.id === c.id)
        const orderNum = idx + 1
        const isFirst = idx <= 0
        const isLast = idx >= sortedCategories.length - 1
        return (
          <div className="flex items-center gap-1.5">
            <div className="flex flex-col gap-0.5">
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground"
                disabled={isFirst || !!list.search}
                onClick={() => handleMove(idx, idx - 1)}
                title="تحريك لأعلى"
              >
                <ChevronUp className="h-3 w-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-4 w-4 p-0 text-muted-foreground hover:text-foreground"
                disabled={isLast || !!list.search}
                onClick={() => handleMove(idx, idx + 1)}
                title="تحريك لأسفل"
              >
                <ChevronDown className="h-3 w-3" />
              </Button>
            </div>
            <input
              type="number"
              min={1}
              max={sortedCategories.length}
              defaultValue={orderNum}
              key={`tbl-order-${c.id}-${orderNum}`}
              onKeyDown={(e) => {
                if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
              }}
              onBlur={(e) => {
                const val = parseInt(e.target.value, 10)
                if (!isNaN(val) && val >= 1 && val <= sortedCategories.length && val !== orderNum) {
                  handleSetOrder(c.id, val)
                } else {
                  e.target.value = String(orderNum)
                }
              }}
              className="w-11 h-6 text-center font-bold text-foreground bg-secondary/80 border rounded text-xs focus:ring-1 focus:ring-primary focus:outline-none"
              title="اكتب رقم الترتيب واضغط Enter"
            />
          </div>
        )
      }
    },
    { key: 'emoji', label: '', render: (c) => <Emoji className="text-xl">{c.emoji}</Emoji> },
    { key: 'name', label: 'الاسم', headerClassName: 'text-center', render: (c) => <span className="font-bold">{c.name}</span> },
    { key: 'color', label: 'اللون', render: (c) => <div className="w-4 h-4 rounded-full shadow-sm" style={{ backgroundColor: c.color }} /> },
    {
      key: 'actions',
      label: 'إجراءات',
      className: 'text-left',
      render: (c) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => startEdit(c)} title="تعديل"><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete(c)} title="حذف"><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      )
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">الأقسام ({categories.length})</h2>
        <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => { showForm ? resetForm() : openAddForm() }}>
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showForm ? 'إغلاق' : 'إضافة قسم'}
        </Button>
      </div>

      {(showForm || editId) && (
        <div className="mx-5 mt-4 p-4 border-2 rounded-2xl bg-card space-y-3 animate-slide-up">
          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <input
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="اسم القسم"
              className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none sm:col-span-2"
              dir="rtl"
            />
            <div className="flex items-center gap-2 bg-secondary px-3 py-1.5 rounded-xl text-xs border border-border/40">
              <span className="text-muted-foreground whitespace-nowrap">الترتيب:</span>
              <input
                type="number"
                min={1}
                max={editId ? sortedCategories.length : sortedCategories.length + 1}
                value={form.sortOrder}
                onChange={e => setForm(f => ({ ...f, sortOrder: Math.max(1, parseInt(e.target.value, 10) || 1) }))}
                className="w-full bg-background rounded-lg text-center font-bold h-7 border text-xs focus:ring-1 focus:ring-primary focus:outline-none"
                title="موضع القسم في الترتيب"
              />
            </div>
            <EmojiPicker value={form.emoji} onChange={emoji => setForm(f => ({ ...f, emoji }))} />
          </div>
          <div className="flex gap-2 items-center">
            <input
              type="color"
              value={form.color}
              onChange={e => setForm(f => ({ ...f, color: e.target.value }))}
              className="w-10 h-10 rounded-lg border-0 cursor-pointer shrink-0"
              title="اختر لون القسم"
            />
            <Button className="flex-1 rounded-xl" onClick={editId ? handleUpdate : handleCreate}>
              {editId ? 'تحديث القسم' : 'إضافة القسم'}
            </Button>
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

      {list.search && (
        <div className="mx-5 mb-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between">
          <span>💡 امسح خانة البحث لتفعيل إعادة ترتيب الأقسام بالسحب والأسهم.</span>
          <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={() => list.setSearch('')}>
            مسح البحث
          </Button>
        </div>
      )}

      {view === 'table' ? (
        <div className="flex-1 p-5 overflow-auto">
          <DataTable
            columns={columns}
            data={list.items}
            keyExtractor={(c) => c.id}
            sort={list.sort}
            onSortChange={list.setSort}
          />
        </div>
      ) : (
        <div className="flex-1 p-5 space-y-2 overflow-y-auto">
          {list.items.map((cat) => {
            const globalIndex = sortedCategories.findIndex(c => c.id === cat.id)
            const orderNum = globalIndex + 1
            const isFirst = globalIndex <= 0
            const isLast = globalIndex >= sortedCategories.length - 1
            const isDragging = draggedId === cat.id
            const isOver = dragOverId === cat.id

            return (
              <div
                key={cat.id}
                draggable={!list.search}
                onDragStart={(e) => {
                  e.dataTransfer.setData('text/plain', cat.id)
                  e.dataTransfer.effectAllowed = 'move'
                  setDraggedId(cat.id)
                }}
                onDragEnd={() => {
                  setDraggedId(null)
                  setDragOverId(null)
                }}
                onDragOver={(e) => {
                  if (list.search) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOverId !== cat.id) setDragOverId(cat.id)
                }}
                onDragLeave={() => {
                  if (dragOverId === cat.id) setDragOverId(null)
                }}
                onDrop={async (e) => {
                  e.preventDefault()
                  const sourceId = e.dataTransfer.getData('text/plain') || draggedId
                  setDraggedId(null)
                  setDragOverId(null)
                  if (!sourceId || sourceId === cat.id) return
                  const fromIdx = sortedCategories.findIndex(c => c.id === sourceId)
                  const toIdx = sortedCategories.findIndex(c => c.id === cat.id)
                  if (fromIdx !== -1 && toIdx !== -1 && fromIdx !== toIdx) {
                    await handleMove(fromIdx, toIdx)
                  }
                }}
                className={cn(
                  "flex items-center gap-3 border-2 rounded-xl bg-card p-3 transition-all select-none",
                  isDragging && "opacity-40 scale-[0.99] border-dashed border-primary",
                  isOver && "border-primary bg-primary/5 shadow-md -translate-y-0.5",
                  !list.search && "cursor-grab active:cursor-grabbing hover:border-border/80"
                )}
              >
                {/* Grip Handle */}
                <div
                  className={cn(
                    "text-muted-foreground p-1 rounded hover:bg-secondary transition-colors",
                    list.search ? "opacity-30 cursor-not-allowed" : "cursor-grab active:cursor-grabbing"
                  )}
                  title={list.search ? "امسح البحث لتفعيل السحب وإعادة الترتيب" : "اسحب لتغيير الترتيب"}
                >
                  <GripVertical className="h-4 w-4" />
                </div>

                {/* Move Up/Down Arrow buttons */}
                <div className="flex flex-col gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 rounded p-0 text-muted-foreground hover:text-foreground hover:bg-secondary"
                    disabled={isFirst || !!list.search}
                    onClick={() => handleMove(globalIndex, globalIndex - 1)}
                    title="تحريك لأعلى"
                  >
                    <ChevronUp className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 rounded p-0 text-muted-foreground hover:text-foreground hover:bg-secondary"
                    disabled={isLast || !!list.search}
                    onClick={() => handleMove(globalIndex, globalIndex + 1)}
                    title="تحريك لأسفل"
                  >
                    <ChevronDown className="h-3.5 w-3.5" />
                  </Button>
                </div>

                <div className="w-3.5 h-3.5 rounded-full shrink-0 shadow-sm" style={{ backgroundColor: cat.color }} />
                <Emoji className="text-2xl">{cat.emoji}</Emoji>
                <span className="flex-1 font-bold text-sm text-foreground">{cat.name}</span>

                {/* Order Input Badge */}
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-secondary/70 px-2.5 py-1 rounded-lg border border-border/60">
                  <span className="font-medium">ترتيب:</span>
                  <input
                    type="number"
                    min={1}
                    max={sortedCategories.length}
                    defaultValue={orderNum}
                    key={`order-input-${cat.id}-${orderNum}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur()
                    }}
                    onBlur={(e) => {
                      const val = parseInt(e.target.value, 10)
                      if (!isNaN(val) && val >= 1 && val <= sortedCategories.length && val !== orderNum) {
                        handleSetOrder(cat.id, val)
                      } else {
                        e.target.value = String(orderNum)
                      }
                    }}
                    className="w-11 h-6 text-center font-bold text-foreground bg-background border border-border rounded focus:ring-1 focus:ring-primary focus:outline-none text-xs"
                    title="اكتب رقم الترتيب واضغط Enter لتغييره مباشرة"
                  />
                </div>

                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => startEdit(cat)} title="تعديل">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete(cat)} title="حذف">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )
          })}
          {list.items.length === 0 && (
            <p className="text-center text-xs text-muted-foreground py-10">لا توجد أقسام مطابقة</p>
          )}
        </div>
      )}

      <Pagination page={list.page} totalPages={list.totalPages} total={list.total} start={list.start} end={list.end} onPageChange={(p) => list.setPage(p)} />

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف القسم"
        description={pendingDelete ? `سيتم تعطيل «${pendingDelete.name}» وإخفاؤه من قوائم البيع.` : undefined}
        allowHardDelete={isAdmin}
        hardDeleteDescription="يحذف القسم نهائياً من قاعدة البيانات. لن يمكن استرجاعه."
        onConfirm={({ hard }) => { if (pendingDelete) { handleDelete(pendingDelete, { hard }); setPendingDelete(null) } }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}

