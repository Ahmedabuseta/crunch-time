import { useEffect, useState, type ReactNode } from 'react'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { createPortal } from 'react-dom'
import { useProductStore } from '@/services/product/product.store'
import { useCategoryStore } from '@/services/category/category.store'
import { useAddonStore } from '@/services/addon/addon.store'
import { useModifierStore } from '@/services/modifier/modifier.store'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { RecipePanel } from './RecipePanel'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Pencil, Trash2, X, Link, ChevronDown, UtensilsCrossed, ClipboardList, PlugZap, SlidersHorizontal, TrendingUp, CheckCircle, AlertTriangle, Eye, EyeOff, ArrowUp, ArrowDown } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'
import { EmojiPicker } from '@/components/ui/emoji-picker'
import { toast } from '@/components/ui/toast'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { ListToolbar } from '@/components/ui/list-toolbar'
import { DataTable, type DataColumn, type SortValue } from '@/components/ui/data-table'
import { Pagination } from '@/components/ui/pagination'
import { useListControls } from '@/components/ui/list-controls'
import type { ViewMode } from '@/components/ui/view-toggle'
import { useIsAdmin } from '@/lib/use-is-admin'
import { Emoji } from '@/components/Emoji'

type TabId = 'data' | 'recipe' | 'addons' | 'modifiers'

export function ProductsPage() {
  const products = useProductStore((s) => s.products)
  const isAdmin = useIsAdmin()
  const fetchProducts = useProductStore((s) => s.fetch)
  const createProduct = useProductStore((s) => s.create)
  const updateProduct = useProductStore((s) => s.update)
  const removeProduct = useProductStore((s) => s.remove)
  const categories = useCategoryStore((s) => s.categories)
  const fetchCategories = useCategoryStore((s) => s.fetch)
  const addons = useAddonStore((s) => s.addons)
  const fetchAddons = useAddonStore((s) => s.fetch)
  const modifierGroups = useModifierStore((s) => s.groups)
  const fetchModifierGroups = useModifierStore((s) => s.fetchGroups)
  const ingredients = useInventoryStore((s) => s.ingredients)
  const fetchIngredients = useInventoryStore((s) => s.fetchIngredients)

  const emptyForm = { name: '', emoji: '', price: '', categoryId: '', description: '' }
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [selectedAddons, setSelectedAddons] = useState<string[]>([])
  const [selectedModGroups, setSelectedModGroups] = useState<string[]>([])
  const [recipeFor, setRecipeFor] = useState<string | null>(null)
  const [view, setView] = useState<ViewMode>('table')
  const [pendingDelete, setPendingDelete] = useState<any>(null)
  const [catFilter, setCatFilter] = useState<string | null>(null)
  const [visibilityFilter, setVisibilityFilter] = useState<string | null>(null)
  const [tab, setTab] = useState<TabId>('data')
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({})
  const [groupModifiers, setGroupModifiers] = useState<Record<string, any[]>>({})

  useEffect(() => { fetchProducts(undefined, true); fetchCategories(); fetchAddons(); fetchModifierGroups(); fetchIngredients() }, [])

  const catMap = new Map(categories.map(c => [c.id, c]))
  const editingProduct = editId ? products.find(p => p.id === editId) : undefined
  const selectedAddonObjs = addons.filter(a => selectedAddons.includes(a.id))
  const selectedModGroupObjs = modifierGroups.filter(g => selectedModGroups.includes(g.id))

  const list = useListControls({
    items: products,
    searchText: (p) => `${p.name} ${p.description} ${catMap.get(p.categoryId)?.name || ''}`,
    filter: (p) =>
      (!catFilter || p.categoryId === catFilter)
      && (visibilityFilter === 'active' ? p.active : visibilityFilter === 'hidden' ? !p.active : true),
  })

  const visibleCount = products.filter(p => p.active).length
  const hiddenCount = products.length - visibleCount

  const SORT_FIELDS: Record<string, ((p: any) => SortValue) | undefined> = {
    name: (p) => p.name,
    cat: (p) => catMap.get(p.categoryId)?.name || '',
    price: (p) => p.price,
    cost: (p) => (p.costPrice > 0 ? p.costPrice : null),
    profit: (p) => (p.costPrice > 0 ? p.price - p.costPrice : null),
    status: (p) => (p.active ? 1 : 0),
  }

  const applySortField = (key: string) => {
    if (key === 'default') return list.setSort(null)
    const value = SORT_FIELDS[key]
    if (value) list.setSort({ key, dir: list.sort?.dir ?? 'asc', value })
  }

  const toggleSortDir = () => {
    if (!list.sort) return
    list.setSort({ ...list.sort, dir: list.sort.dir === 'asc' ? 'desc' : 'asc' })
  }

  const resetForm = () => {
    setForm(emptyForm)
    setSelectedAddons([]); setSelectedModGroups([]); setEditId(null); setShowForm(false)
    setTab('data'); setExpandedGroups({}); setGroupModifiers({})
  }

  const openCreate = () => {
    setEditId(null); setShowForm(true)
    setForm(emptyForm); setSelectedAddons([]); setSelectedModGroups([])
    setTab('data'); setExpandedGroups({}); setGroupModifiers({})
  }

  const loadGroupModifiers = async (groupId: string) => {
    if (groupModifiers[groupId]) return
    const mods = await window.api.modifier.listByGroup(groupId)
    setGroupModifiers((prev) => ({ ...prev, [groupId]: mods as any[] }))
  }

  const toggleGroupOpen = (groupId: string) => {
    const next = !expandedGroups[groupId]
    setExpandedGroups(prev => ({ ...prev, [groupId]: next }))
    if (next) loadGroupModifiers(groupId)
  }

  const handleCreate = async () => {
    if (!form.name || !form.price || !form.categoryId) return
    const id = await createProduct({ name: form.name, emoji: form.emoji || '', price: parseFloat(form.price), categoryId: form.categoryId, description: form.description })
    await Promise.all([
      window.api.addon.setProductLinks(id, selectedAddons),
      window.api.modifier.setProductLinks(id, selectedModGroups),
    ])
    toast({ title: 'تم إنشاء المنتج', description: form.name, variant: 'success' })
    setEditId(id); setShowForm(false); setTab('recipe')
  }

  const handleUpdate = async () => {
    if (!editId || !form.name) return
    await updateProduct(editId, { name: form.name, emoji: form.emoji, price: parseFloat(form.price), categoryId: form.categoryId, description: form.description })
    await Promise.all([
      window.api.addon.setProductLinks(editId, selectedAddons),
      window.api.modifier.setProductLinks(editId, selectedModGroups),
    ])
    toast({ title: 'تم تحديث المنتج', description: form.name, variant: 'success' })
    resetForm()
  }

  const handleDelete = async (p: any, opts?: { hard?: boolean }) => {
    await removeProduct(p.id, opts)
    toast({ title: opts?.hard ? 'تم الحذف النهائي للمنتج' : 'تم حذف المنتج', description: p.name, variant: 'success' })
  }

  const toggleVisibility = async (p: any) => {
    await updateProduct(p.id, { active: !p.active })
    toast({
      title: p.active ? 'تم إخفاء المنتج من القائمة' : 'تم إظهار المنتج في القائمة',
      description: p.name,
      variant: 'success',
    })
  }

  const startEdit = async (p: any) => {
    setEditId(p.id); setShowForm(false)
    setForm({ name: p.name, emoji: p.emoji, price: String(p.price), categoryId: p.categoryId, description: p.description })
    setTab('data'); setExpandedGroups({}); setGroupModifiers({})
    const [addonLinks, modLinks] = await Promise.all([
      window.api.addon.listByProduct(p.id),
      window.api.modifier.listByProduct(p.id),
    ])
    setSelectedAddons((addonLinks as any[]).map(a => a.id))
    setSelectedModGroups((modLinks as any[]).map(g => g.id ?? g.groupId).filter(Boolean))
  }

  const columns: DataColumn<any>[] = [
    {
      key: 'name', label: 'المنتج', sortValue: (p) => p.name, render: (p) => (
        <div className="flex items-center gap-2">
          <Emoji className="text-2xl shrink-0">{p.emoji}</Emoji>
          <div className="min-w-0">
            <p className="font-bold truncate">{p.name}</p>
            {p.description && <p className="text-[10px] text-muted-foreground truncate">{p.description}</p>}
          </div>
        </div>
      ),
    },
    { key: 'cat', label: 'القسم', sortValue: (p: any) => catMap.get(p.categoryId)?.name || '', render: (p) => <span className="text-xs bg-secondary rounded-full px-2 py-0.5">{catMap.get(p.categoryId)?.name || '—'}</span> },
    { key: 'price', label: 'السعر', sortValue: (p) => p.price, render: (p) => <span className="font-black text-primary">{fmtMoney(p.price)} ج.م</span> },
    { key: 'cost', label: 'التكلفة', sortValue: (p: any) => p.costPrice > 0 ? p.costPrice : null, render: (p) => <span>{p.costPrice > 0 ? `${fmtMoney(p.costPrice)} ج.م` : '—'}</span> },
    {
      key: 'profit', label: 'الربح', sortValue: (p: any) => p.costPrice > 0 ? p.price - p.costPrice : null, render: (p) => {
        if (!(p.costPrice > 0)) return <span className="text-muted-foreground">—</span>
        const profit = p.price - p.costPrice
        const margin = p.price > 0 ? (profit / p.price) * 100 : 0
        return (
          <div>
            <span className={cn("font-black", profit >= 0 ? "text-green-400" : "text-red-400")}>{fmtMoney(profit)} ج.م</span>
            <span className="block text-[10px] text-muted-foreground">هامش {margin.toFixed(0)}%</span>
          </div>
        )
      },
    },
    {
      key: 'status', label: 'الظهور', sortValue: (p) => (p.active ? 1 : 0), render: (p) => (
        <span className={cn(
          "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black",
          p.active ? "bg-green-500/10 text-green-400" : "bg-secondary text-muted-foreground",
        )}>
          {p.active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
          {p.active ? 'ظاهر' : 'مخفي'}
        </span>
      ),
    },
    {
      key: 'actions', label: 'إجراءات', className: 'text-left', render: (p) => (
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-7 w-7 rounded-lg", p.active ? "text-muted-foreground" : "text-primary")}
            title={p.active ? 'إخفاء من القائمة' : 'إظهار في القائمة'}
            onClick={() => toggleVisibility(p)}
          >
            {p.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setRecipeFor(recipeFor === p.id ? null : p.id)}><Link className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => startEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">المنتجات ({products.length})</h2>
        <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => { showForm || editId ? resetForm() : openCreate() }}>
          {<Plus className="h-4 w-4" />} إضافة منتج
        </Button>
      </div>

      {/* Add / Edit modal */}
      {(showForm || editId) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={resetForm}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
          <div className="relative w-full max-w-2xl max-h-[90vh] border-2 border-border rounded-3xl bg-card shadow-2xl flex flex-col animate-scale-in overflow-hidden" onClick={(e) => e.stopPropagation()}>
            {/* Drawer header */}
            <div className="flex items-center justify-between px-5 py-4 border-b bg-card">
              <div>
                <h3 className="font-black text-base">{editId ? 'تعديل المنتج' : 'إضافة منتج'}</h3>
                {editingProduct && <p className="text-[10px] text-muted-foreground"><Emoji>{editingProduct.emoji}</Emoji> {editingProduct.name}</p>}
              </div>
              <Button variant="ghost" size="icon" className="rounded-xl" onClick={resetForm}><X className="h-4 w-4" /></Button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1.5 px-4 pt-3 pb-2 border-b overflow-x-auto">
              {([
                { id: 'data', label: 'البيانات', icon: <ClipboardList className="h-4 w-4" /> },
                { id: 'recipe', label: 'الوصفة', icon: <UtensilsCrossed className="h-4 w-4" /> },
                { id: 'addons', label: 'الإضافات', icon: <PlugZap className="h-4 w-4" /> },
                { id: 'modifiers', label: 'الموديفاير', icon: <SlidersHorizontal className="h-4 w-4" /> },
              ] as { id: TabId; label: string; icon: ReactNode }[]).map((t) => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={cn("flex items-center gap-1.5 px-4 py-2.5 min-h-[44px] rounded-xl text-sm font-bold transition-all cursor-pointer shrink-0",
                    tab === t.id ? "bg-primary text-primary-foreground shadow" : "text-muted-foreground hover:bg-secondary")}>
                  {t.icon} {t.label}
                </button>
              ))}
            </div>

            {/* Drawer body */}
            <ScrollArea className="flex-1 min-h-0">
              <div className="p-5 space-y-4">
                {tab === 'data' && (
                  <>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المنتج" className="px-4 py-3 min-h-[48px] rounded-xl bg-secondary text-base border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
                      <EmojiPicker value={form.emoji} onChange={emoji => setForm(f => ({ ...f, emoji }))} />
                      <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="السعر (ج.م)" className="px-4 py-3 min-h-[48px] rounded-xl bg-secondary text-base border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
                    </div>

                    <Select value={form.categoryId} onValueChange={v => setForm(f => ({ ...f, categoryId: v }))}>
                      <SelectTrigger className="w-full min-h-[48px] rounded-xl bg-secondary text-base">
                        <SelectValue placeholder="اختر القسم" />
                      </SelectTrigger>
                      <SelectContent>
                        {categories.map(c => <SelectItem key={c.id} value={c.id}><Emoji>{c.emoji}</Emoji> {c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>

                    <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="الوصف" className="w-full px-4 py-3 min-h-[48px] rounded-xl bg-secondary text-base border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />

                    {editId && editingProduct && (
                      <>
                        <p className="text-[10px] text-muted-foreground -mt-2">التكلفة تُحسب تلقائياً من الوصفة (المكونات × سعر المادة)</p>
                        <div className="rounded-xl bg-secondary/60 border border-border p-3 text-xs">
                          <div className="flex justify-between py-0.5"><span className="text-muted-foreground">تكلفة الوصفة</span><span className="font-bold">{editingProduct.costPrice > 0 ? `${fmtMoney(editingProduct.costPrice)} ج.م` : 'لم تُحدد بعد'}</span></div>
                          <div className="flex justify-between py-0.5"><span className="text-muted-foreground">هامش الربح</span>
                            <span className={cn("font-black", parseFloat(form.price) - editingProduct.costPrice < 0 ? "text-destructive" : "text-primary")}>
                              {form.price && editingProduct.costPrice > 0 ? `${fmtMoney(parseFloat(form.price) - editingProduct.costPrice)} ج.م` : '—'}
                            </span>
                          </div>
                        </div>
                        {editingProduct.costPrice > 0 && (
                          <div className="rounded-xl bg-primary/5 border border-primary/20 p-3 text-[11px] space-y-1">
                            <p className="font-black text-primary flex items-center gap-1"><TrendingUp className="h-3.5 w-3.5" /> سعر مقترح (يُحدَّث تلقائياً مع تغيّر تكلفة الأصناف)</p>
                            {(() => {
                              const suggested = editingProduct.costPrice / (1 - 0.65)
                              const current = parseFloat(form.price)
                              return (
                                <div className="flex justify-between items-center">
                                  <span className="text-muted-foreground font-bold">أفضل قيمة — هامش 65%</span>
                                  <span className="flex items-center gap-1.5">
                                    <span className="font-black text-primary">{fmtMoney(suggested)} ج.م</span>
                                    {current > 0 && (
                                      current >= suggested * 0.9 && current <= suggested * 1.1
                                        ? <CheckCircle className="h-3.5 w-3.5 text-green-500" />
                                        : <AlertTriangle className={cn("h-3.5 w-3.5", current < suggested ? "text-yellow-500" : "text-orange-500")} />
                                    )}
                                  </span>
                                </div>
                              )
                            })()}
                            <p className="text-[10px] text-muted-foreground">وفق معيار تكلفة الطعام 35% من سعر البيع</p>
                          </div>
                        )}
                      </>
                    )}
                  </>
                )}

                {tab === 'recipe' && (
                  editId ? (
                    <RecipePanel
                      title={`وصفة المنتج — ${editingProduct?.name || ''}`}
                      targetId={editId}
                      entityField="productId"
                      ingredients={ingredients}
                      fetchRecipes={(id) => window.api.inventory.listRecipes(id)}
                      upsertRecipe={async (data) => (await window.api.inventory.upsertRecipe(data) as { id: string }).id}
                      deleteRecipe={(id) => window.api.inventory.deleteRecipe(id)}
                      onChanged={() => fetchProducts(undefined, true)}
                      sellingPrice={editingProduct?.price}
                    />
                  ) : (
                    <div className="rounded-2xl border border-dashed border-border p-6 text-center space-y-2">
                      <UtensilsCrossed className="h-8 w-8 mx-auto text-muted-foreground/50" />
                      <p className="text-xs font-bold text-muted-foreground">احفظ المنتج أولاً</p>
                      <p className="text-[10px] text-muted-foreground">بعد إنشاء المنتج سيُفتح هذا التبويب تلقائياً لتحديد الوصفة</p>
                    </div>
                  )
                )}

                {tab === 'addons' && (
                  <>
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground mb-1.5">إضافات هذا المنتج:</p>
                      {addons.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground">لا توجد إضافات — أنشئها من صفحة الإضافات</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {addons.map(a => {
                            const selected = selectedAddons.includes(a.id)
                            return (
                              <button key={a.id} onClick={() => setSelectedAddons(s => selected ? s.filter(id => id !== a.id) : [...s, a.id])}
                                className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer",
                                  selected ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-transparent hover:border-border")}>
                                <Emoji>{a.emoji}</Emoji> {a.name} {a.price > 0 && <span>{a.price}ج</span>}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {selectedAddonObjs.length > 0 && (
                      <div className="space-y-3">
                        <p className="text-[10px] font-bold text-muted-foreground">وصفات الإضافات المرتبطة (تُخصم من المخزون عند البيع):</p>
                        {selectedAddonObjs.map(a => (
                          <div key={a.id} className="border border-border rounded-2xl p-3 space-y-2">
                            <p className="text-xs font-bold"><Emoji>{a.emoji}</Emoji> {a.name} <span className="text-[10px] text-muted-foreground font-medium">+{fmtMoney(a.price)} ج.م</span></p>
                            <RecipePanel
                              title="وصفة الإضافة"
                              targetId={a.id}
                              entityField="addonId"
                              ingredients={ingredients}
                              fetchRecipes={(id) => window.api.addon.listRecipes(id)}
                              upsertRecipe={async (data) => (await window.api.addon.upsertRecipe(data) as { id: string }).id}
                              deleteRecipe={(id) => window.api.addon.deleteRecipe(id)}
                              sellingPrice={a.price}
                            />
                          </div>
                        ))}
                      </div>
                    )}
                  </>
                )}

                {tab === 'modifiers' && (
                  <>
                    <div>
                      <p className="text-[10px] font-bold text-muted-foreground mb-1.5">مجموعات الموديفاير لهذا المنتج:</p>
                      {modifierGroups.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground">لا توجد مجموعات — أنشئها من صفحة الموديفاير</p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {modifierGroups.map(g => {
                            const selected = selectedModGroups.includes(g.id)
                            return (
                              <button key={g.id} onClick={() => setSelectedModGroups(s => selected ? s.filter(id => id !== g.id) : [...s, g.id])}
                                className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer",
                                  selected ? "bg-blue-500 text-white border-blue-500" : "bg-secondary text-muted-foreground border-transparent hover:border-border")}>
                                {g.name}
                              </button>
                            )
                          })}
                        </div>
                      )}
                    </div>

                    {selectedModGroupObjs.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] font-bold text-muted-foreground">وصفات الموديفاير المرتبطة:</p>
                        {selectedModGroupObjs.map(g => {
                          const open = !!expandedGroups[g.id]
                          return (
                            <div key={g.id} className="border border-border rounded-2xl overflow-hidden">
                              <button onClick={() => toggleGroupOpen(g.id)}
                                className="w-full flex items-center gap-2 px-3 py-2.5 cursor-pointer hover:bg-secondary/50 transition-colors">
                                <ChevronDown className={cn("h-3.5 w-3.5 text-muted-foreground transition-transform", open && "rotate-180")} />
                                <span className="text-xs font-bold">{g.name}</span>
                                <span className="text-[10px] text-muted-foreground">{g.type === 'multi-select' ? 'اختيار متعدد' : 'اختيار واحد'}</span>
                              </button>
                              {open && (
                                <div className="border-t border-border p-3 space-y-3">
                                  {(groupModifiers[g.id] || []).length === 0 ? (
                                    <p className="text-[10px] text-muted-foreground">لا توجد موديفاير في هذه المجموعة</p>
                                  ) : (groupModifiers[g.id] || []).map(m => (
                                    <div key={m.id} className="space-y-1.5">
                                      <p className="text-xs font-bold">{m.name}{m.priceAdjustment > 0 && <span className="text-primary text-[10px] font-bold"> +{fmtMoney(m.priceAdjustment)} ج.م</span>}</p>
                                      <RecipePanel
                                        title="وصفة الموديفاير"
                                        targetId={m.id}
                                        entityField="modifierId"
                                        ingredients={ingredients}
                                        fetchRecipes={(id) => window.api.modifier.listRecipes(id)}
                                        upsertRecipe={async (data) => (await window.api.modifier.upsertRecipe(data) as { id: string }).id}
                                        deleteRecipe={(id) => window.api.modifier.deleteRecipe(id)}
                                        sellingPrice={m.priceAdjustment}
                                      />
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>

            {/* Drawer footer */}
            <div className="flex gap-2 p-4 border-t bg-card">
              <Button className="flex-1 rounded-xl min-h-[48px] text-base font-bold" onClick={editId ? handleUpdate : handleCreate}>{editId ? 'حفظ التغييرات' : (tab === 'recipe' ? 'إنشاء المنتج ثم الوصفة' : 'إضافة المنتج')}</Button>
              <Button variant="ghost" className="rounded-xl min-h-[48px] px-6" onClick={resetForm}>إلغاء</Button>
            </div>
          </div>
        </div>
      )}

      <ListToolbar
        search={list.search}
        onSearchChange={(v) => { list.setSearch(v); list.setPage(1) }}
        searchPlaceholder="بحث عن منتج..."
        sort={
          <div className="flex items-center gap-1 shrink-0">
            <Select value={list.sort?.key ?? 'default'} onValueChange={applySortField}>
              <SelectTrigger className="h-9 w-32 rounded-lg bg-secondary text-xs font-bold">
                <SelectValue placeholder="الترتيب" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="default">بدون ترتيب</SelectItem>
                <SelectItem value="name">الاسم</SelectItem>
                <SelectItem value="cat">القسم</SelectItem>
                <SelectItem value="price">السعر</SelectItem>
                <SelectItem value="cost">التكلفة</SelectItem>
                <SelectItem value="profit">الربح</SelectItem>
                <SelectItem value="status">الظهور</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0 rounded-lg"
              disabled={!list.sort}
              onClick={toggleSortDir}
              title={list.sort?.dir === 'desc' ? 'ترتيب تنازلي' : 'ترتيب تصاعدي'}
            >
              {list.sort?.dir === 'desc' ? <ArrowDown className="h-3.5 w-3.5" /> : <ArrowUp className="h-3.5 w-3.5" />}
            </Button>
          </div>
        }
        view={view}
        onViewChange={setView}
        filters={[
          { value: null, label: 'الكل', count: products.length },
          ...categories.map(c => ({ value: c.id, label: `${c.emoji} ${c.name}`, count: products.filter(p => p.categoryId === c.id).length })),
        ]}
        filterValue={catFilter}
        onFilterChange={(v) => { setCatFilter(v); list.setPage(1) }}
        extraFilters={[
          { value: null, label: 'كل المنتجات', count: products.length },
          { value: 'active', label: 'ظاهر في القائمة', count: visibleCount },
          { value: 'hidden', label: 'مخفي', count: hiddenCount },
        ]}
        extraFilterValue={visibilityFilter}
        onExtraFilterChange={(v) => { setVisibilityFilter(v); list.setPage(1) }}
      />

      <div className="flex-1 min-h-0 overflow-y-auto">
        {view === 'table' ? (
          <div className="p-5">
            <DataTable
              columns={columns}
              data={list.items}
              keyExtractor={(p) => p.id}
              className="mb-4"
              sort={list.sort}
              onSortChange={list.setSort}
              rowClassName={(p) => p.active ? '' : 'opacity-60'}
            />
            {recipeFor && createPortal(
              <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setRecipeFor(null)}>
                <div dir="rtl" className="w-[620px] max-w-[94vw] max-h-[85vh] overflow-y-auto animate-slide-up" onClick={(e) => e.stopPropagation()}>
                  <RecipePanel
                    title={`وصفة المنتج — ${products.find(p => p.id === recipeFor)?.name}`}
                    targetId={recipeFor}
                    entityField="productId"
                    ingredients={ingredients}
                    fetchRecipes={(id) => window.api.inventory.listRecipes(id)}
                    upsertRecipe={async (data) => (await window.api.inventory.upsertRecipe(data) as { id: string }).id}
                    deleteRecipe={(id) => window.api.inventory.deleteRecipe(id)}
                    onChanged={() => fetchProducts(undefined, true)}
                    onClose={() => setRecipeFor(null)}
                    sellingPrice={products.find(p => p.id === recipeFor)?.price}
                  />
                </div>
              </div>, document.body
            )}
          </div>
        ) : (
          <div className="p-5">
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              {list.items.map(p => (
                <div key={p.id} className={cn("border-2 rounded-2xl bg-card p-4 space-y-2", !p.active && "opacity-60")}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Emoji className="text-3xl">{p.emoji}</Emoji>
                      <span className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-black",
                        p.active ? "bg-green-500/10 text-green-400" : "bg-secondary text-muted-foreground",
                      )}>
                        {p.active ? <Eye className="h-3 w-3" /> : <EyeOff className="h-3 w-3" />}
                        {p.active ? 'ظاهر' : 'مخفي'}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        className={cn("h-7 w-7 rounded-lg", p.active ? "text-muted-foreground" : "text-primary")}
                        title={p.active ? 'إخفاء من القائمة' : 'إظهار في القائمة'}
                        onClick={() => toggleVisibility(p)}
                      >
                        {p.active ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                      </Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => setRecipeFor(recipeFor === p.id ? null : p.id)}><Link className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => startEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => setPendingDelete(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </div>
                  <p className="font-bold text-sm">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.description}</p>
                  <div className="flex items-center justify-between">
                    <span className="text-xs bg-secondary rounded-full px-2 py-0.5">{catMap.get(p.categoryId)?.name}</span>
                    <div className="text-right">
                      <span className="font-black text-primary text-sm">{fmtMoney(p.price)} ج.م</span>
                      {p.costPrice > 0 && <span className="text-[10px] text-muted-foreground block">تكلفة: {fmtMoney(p.costPrice)}</span>}
                    </div>
                  </div>
                  {recipeFor === p.id && (
                    <div className="border-t border-border pt-3 mt-2 animate-slide-up">
                      <RecipePanel
                        title={`وصفة المنتج — ${p.name}`}
                        targetId={p.id}
                        entityField="productId"
                        ingredients={ingredients}
                        fetchRecipes={(id) => window.api.inventory.listRecipes(id)}
                        upsertRecipe={async (data) => (await window.api.inventory.upsertRecipe(data) as { id: string }).id}
                        deleteRecipe={(id) => window.api.inventory.deleteRecipe(id)}
                        onChanged={() => fetchProducts(undefined, true)}
                        sellingPrice={p.price}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
            {list.items.length === 0 && (
              <p className="text-center text-xs text-muted-foreground py-10">لا توجد منتجات مطابقة</p>
            )}
          </div>
        )}
      </div>

      <Pagination page={list.page} totalPages={list.totalPages} total={list.total} start={list.start} end={list.end} onPageChange={(p) => list.setPage(p)} />

      <ConfirmDialog
        open={!!pendingDelete}
        title="حذف المنتج"
        description={pendingDelete ? `سيتم تعطيل «${pendingDelete.name}» وإخفاؤه من قوائم البيع.` : undefined}
        allowHardDelete={isAdmin}
        hardDeleteDescription="يحذف المنتج ووصفاته نهائياً. لن يمكن استرجاعه."
        onConfirm={({ hard }) => { if (pendingDelete) { handleDelete(pendingDelete, { hard }); setPendingDelete(null) } }}
        onCancel={() => setPendingDelete(null)}
      />
    </div>
  )
}
