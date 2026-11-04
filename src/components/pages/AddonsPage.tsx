import { useEffect, useState } from 'react'
import { useAddonStore } from '@/services/addon/addon.store'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { RecipePanel } from './RecipePanel'
import { Button } from '@/components/ui/button'
import { EmojiPicker } from '@/components/ui/emoji-picker'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DataTable, type DataColumn } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { useListControls } from '@/components/ui/list-controls'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ProductLinkDialog } from '@/components/ProductLinkDialog'
import { toast } from '@/components/ui/toast'
import { Emoji } from '@/components/Emoji'
import { fmtMoney } from '@/lib/format'
import { useIsAdmin } from '@/lib/use-is-admin'
import { cn } from '@/lib/utils'
import type { ViewMode } from '@/components/ui/view-toggle'
import {
  Eye,
  EyeOff,
  Link2,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react'

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'خطأ غير متوقع'
}

export function AddonsPage() {
  const addons = useAddonStore((s) => s.addons)
  const isAdmin = useIsAdmin()
  const fetchAddons = useAddonStore((s) => s.fetch)
  const create = useAddonStore((s) => s.create)
  const update = useAddonStore((s) => s.update)
  const remove = useAddonStore((s) => s.remove)
  const ingredients = useInventoryStore((s) => s.ingredients)
  const fetchIngredients = useInventoryStore((s) => s.fetchIngredients)

  const [formOpen, setFormOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', emoji: '➕', price: '', active: true })
  const [formError, setFormError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [recipeFor, setRecipeFor] = useState<string | null>(null)
  const [linkFor, setLinkFor] = useState<any | null>(null)
  const [linkIds, setLinkIds] = useState<string[]>([])
  const [status, setStatus] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('table')
  const [pendingDelete, setPendingDelete] = useState<any>(null)

  useEffect(() => {
    void fetchAddons(true)
    void fetchIngredients()
    // The sales screens share this store; never leave hidden rows behind.
    return () => { void fetchAddons(false) }
  }, [])

  const list = useListControls({
    items: addons,
    searchText: (addon) => `${addon.name} ${addon.emoji}`,
    filter: (addon) =>
      status === 'active' ? addon.active : status === 'hidden' ? !addon.active : true,
  })

  const activeCount = addons.filter((addon) => addon.active).length
  const hiddenCount = addons.length - activeCount

  const resetForm = () => {
    setForm({ name: '', emoji: '➕', price: '', active: true })
    setEditId(null)
    setFormOpen(false)
    setFormError(null)
  }

  const openCreate = () => {
    setForm({ name: '', emoji: '➕', price: '', active: true })
    setEditId(null)
    setFormError(null)
    setFormOpen(true)
  }

  const openEdit = (addon: any) => {
    setForm({ name: addon.name, emoji: addon.emoji, price: String(addon.price), active: !!addon.active })
    setEditId(addon.id)
    setFormError(null)
    setFormOpen(true)
  }

  const save = async () => {
    const name = form.name.trim()
    const price = Number(form.price)
    if (!name) { setFormError('اسم الإضافة مطلوب'); return }
    if (!Number.isFinite(price) || price < 0) { setFormError('اكتب سعر صحيح'); return }

    setSaving(true)
    setFormError(null)
    try {
      if (editId) {
        await update(editId, { name, price, emoji: form.emoji || '➕', active: form.active })
      } else {
        await create({ name, price, emoji: form.emoji || '➕', active: form.active })
      }
      toast({
        title: editId ? 'تم تحديث الإضافة' : 'تم إنشاء الإضافة',
        description: name,
        variant: 'success',
      })
      resetForm()
    } catch (error) {
      setFormError(messageOf(error))
    } finally {
      setSaving(false)
    }
  }

  const toggleActive = async (addon: any) => {
    try {
      await update(addon.id, { active: !addon.active })
      toast({ title: addon.active ? 'تم إخفاء الإضافة' : 'تم إظهار الإضافة', description: addon.name, variant: 'success' })
    } catch (error) {
      toast({ title: messageOf(error), variant: 'error' })
    }
  }

  const handleDelete = async (addon: any, opts?: { hard?: boolean }) => {
    try {
      await remove(addon.id, opts)
      toast({ title: opts?.hard ? 'تم الحذف النهائي للإضافة' : 'تم حذف الإضافة', description: addon.name, variant: 'success' })
    } catch (error) {
      toast({ title: messageOf(error), variant: 'error' })
    }
  }

  const openLinks = async (addon: any) => {
    try {
      const products = await window.api.addon.listProducts(addon.id) as any[]
      setLinkIds(products.map((product) => product.id))
      setLinkFor(addon)
    } catch (error) {
      toast({ title: messageOf(error), variant: 'error' })
    }
  }

  const columns: DataColumn<any>[] = [
    {
      key: 'name',
      label: 'الإضافة',
      sortValue: (addon) => addon.name,
      render: (addon) => (
        <div className="flex items-center gap-2">
          <Emoji className="text-xl">{addon.emoji}</Emoji>
          <span className="font-bold">{addon.name}</span>
        </div>
      ),
    },
    {
      key: 'price',
      label: 'السعر',
      sortValue: (addon) => addon.price,
      render: (addon) => <span className="font-black text-primary">{fmtMoney(addon.price)} ج.م</span>,
    },
    {
      key: 'usage',
      label: 'المنتجات',
      sortValue: (addon) => addon.productCount ?? 0,
      render: (addon) => (
        <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">
          <Link2 className="h-3 w-3" /> {addon.productCount ?? 0}
        </span>
      ),
    },
    {
      key: 'status',
      label: 'الظهور',
      sortValue: (addon) => (addon.active ? 1 : 0),
      render: (addon) => (
        <span className={cn(
          'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black',
          addon.active ? 'bg-green-500/10 text-green-400' : 'bg-secondary text-muted-foreground',
        )}>
          {addon.active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          {addon.active ? 'ظاهر' : 'مخفي'}
        </span>
      ),
    },
    {
      key: 'actions',
      label: 'إجراءات',
      className: 'text-left',
      render: (addon) => (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title={addon.active ? 'إخفاء' : 'إظهار'} onClick={() => void toggleActive(addon)}>
            {addon.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="ربط بالمنتجات" onClick={() => void openLinks(addon)}>
            <Link2 className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="الوصفة" onClick={() => setRecipeFor(recipeFor === addon.id ? null : addon.id)}>
            <UtensilsCrossed className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" title="تعديل" onClick={() => openEdit(addon)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" title="حذف" onClick={() => setPendingDelete(addon)}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-5 py-4">
        <div>
          <h2 className="text-base font-black">الإضافات ({addons.length})</h2>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{activeCount} ظاهر · {hiddenCount} مخفي</p>
        </div>
        <Button size="sm" className="gap-1.5 rounded-xl" onClick={openCreate}>
          <Plus className="h-4 w-4" /> إضافة
        </Button>
      </div>

      <ListToolbar
        search={list.search}
        onSearchChange={(value) => { list.setSearch(value); list.setPage(1) }}
        searchPlaceholder="بحث عن إضافة..."
        view={view}
        onViewChange={setView}
      >
        <Select
          value={status ?? 'all'}
          onValueChange={(value) => { setStatus(value === 'all' ? null : value); list.setPage(1) }}
        >
          <SelectTrigger className="h-9 w-[118px] rounded-lg bg-secondary text-xs font-bold">
            <SelectValue placeholder="الظهور" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل ({addons.length})</SelectItem>
            <SelectItem value="active">ظاهر ({activeCount})</SelectItem>
            <SelectItem value="hidden">مخفي ({hiddenCount})</SelectItem>
          </SelectContent>
        </Select>
      </ListToolbar>

      {view === 'table' ? (
        <div className="flex-1 overflow-auto p-5">
          <DataTable
            columns={columns}
            data={list.items}
            keyExtractor={(addon) => addon.id}
            sort={list.sort}
            onSortChange={list.setSort}
            rowClassName={(addon) => (addon.active ? '' : 'opacity-60')}
          />
        </div>
      ) : (
        <div className="grid flex-1 content-start grid-cols-2 gap-3 overflow-y-auto p-5 lg:grid-cols-4">
          {list.items.map((addon) => (
            <div key={addon.id} className={cn('flex flex-col items-center gap-2 rounded-2xl border-2 bg-card p-4', !addon.active && 'opacity-60')}>
              <Emoji className="text-3xl">{addon.emoji}</Emoji>
              <p className="text-sm font-bold">{addon.name}</p>
              <p className="text-sm font-black text-primary">{fmtMoney(addon.price)} ج.م</p>
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                <Link2 className="h-3 w-3" /> {addon.productCount ?? 0} منتج
              </div>
              <span className={cn(
                'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black',
                addon.active ? 'bg-green-500/10 text-green-400' : 'bg-secondary text-muted-foreground',
              )}>
                {addon.active ? 'ظاهر' : 'مخفي'}
              </span>
              <div className="flex flex-wrap justify-center gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => void toggleActive(addon)}>
                  {addon.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => void openLinks(addon)}>
                  <Link2 className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setRecipeFor(recipeFor === addon.id ? null : addon.id)}>
                  <UtensilsCrossed className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => openEdit(addon)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete(addon)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
          {list.items.length === 0 && (
            <p className="col-span-full py-10 text-center text-xs text-muted-foreground">لا توجد إضافات مطابقة</p>
          )}
        </div>
      )}

      {recipeFor && (
        <div className="px-5 pb-5">
          <div className="animate-slide-up rounded-2xl border-2 bg-card p-4">
            <RecipePanel
              title={`وصفة الإضافة — ${addons.find((addon) => addon.id === recipeFor)?.name}`}
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

      <Pagination
        page={list.page}
        totalPages={list.totalPages}
        total={list.total}
        start={list.start}
        end={list.end}
        onPageChange={(page) => list.setPage(page)}
      />

      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={resetForm}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
          <div
            className="relative w-full max-w-md animate-scale-in rounded-3xl border-2 border-border bg-card shadow-2xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b px-5 py-4">
              <h3 className="text-sm font-black">{editId ? 'تعديل الإضافة' : 'إضافة جديدة'}</h3>
              <Button variant="ghost" size="icon" className="rounded-xl" onClick={resetForm}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="space-y-3 p-5">
              <div className="grid grid-cols-3 gap-3">
                <input
                  value={form.name}
                  onChange={(event) => { setForm((prev) => ({ ...prev, name: event.target.value })); setFormError(null) }}
                  placeholder="اسم الإضافة"
                  className="col-span-2 min-h-[44px] rounded-xl border-0 bg-secondary px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                  dir="rtl"
                />
                <EmojiPicker value={form.emoji} onChange={(emoji) => setForm((prev) => ({ ...prev, emoji }))} />
              </div>
              <input
                type="number"
                value={form.price}
                onChange={(event) => { setForm((prev) => ({ ...prev, price: event.target.value })); setFormError(null) }}
                placeholder="السعر (ج.م)"
                className="min-h-[44px] w-full rounded-xl border-0 bg-secondary px-3 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <label className="flex cursor-pointer items-center gap-2 rounded-xl bg-secondary/60 px-3 py-2.5 text-xs font-bold">
                <input
                  type="checkbox"
                  checked={form.active}
                  onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
                  className="h-4 w-4 accent-primary"
                />
                ظاهر في قوائم البيع
              </label>
              {formError && <p className="text-[11px] font-bold text-destructive">{formError}</p>}
            </div>

            <div className="flex gap-2 border-t p-4">
              <Button className="flex-1 rounded-xl" disabled={saving} onClick={() => void save()}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : editId ? 'حفظ التغييرات' : 'إضافة'}
              </Button>
              <Button variant="ghost" className="rounded-xl" onClick={resetForm}>إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      <ProductLinkDialog
        open={!!linkFor}
        title={`ربط «${linkFor?.name ?? ''}» بالمنتجات`}
        description="اختَر المنتجات التي تعرض هذه الإضافة. المنتجات المخفية تظهر هنا أيضاً."
        productIds={linkIds}
        onSave={async (ids) => {
          if (!linkFor) return
          await window.api.addon.setProducts(linkFor.id, ids)
          await fetchAddons(true)
          toast({ title: 'تم تحديث ربط المنتجات', description: linkFor.name, variant: 'success' })
        }}
        onClose={() => setLinkFor(null)}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف الإضافة"
        description={pendingDelete ? `سيتم تعطيل «${pendingDelete.name}» وإخفاؤه من قوائم البيع.` : undefined}
        allowHardDelete={isAdmin}
        hardDeleteDescription="يحذف الإضافة ووصفاتها نهائياً. لن يمكن استرجاعه."
        onConfirm={({ hard }) => { if (pendingDelete) { void handleDelete(pendingDelete, { hard }); setPendingDelete(null) } }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
