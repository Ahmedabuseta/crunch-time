import { useEffect, useState } from 'react'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { Button } from '@/components/ui/button'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { toast } from '@/components/ui/toast'
import { fmtMoney } from '@/lib/format'
import { Plus, Pencil, Trash2, Layers, X, Check } from 'lucide-react'
import { useIsAdmin } from '@/lib/use-is-admin'

interface SubRecipeRow {
  id: string
  name: string
  unit: string
  active: boolean
  costPerUnit: number
  ingredientCount: number
}

interface SubRecipeIngredientRow {
  id: string
  subRecipeId: string
  ingredientId: string
  quantityPerUnit: number
  ingredientName: string
  unit: string
  costPerUnit: number
  lineCost: number
}

export function SubRecipesSection() {
  const isAdmin = useIsAdmin()
  const ingredients = useInventoryStore((s) => s.ingredients)

  const [subRecipes, setSubRecipes] = useState<SubRecipeRow[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', unit: 'وحدة' })
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const [openSubId, setOpenSubId] = useState<string | null>(null)
  const [subIngs, setSubIngs] = useState<SubRecipeIngredientRow[]>([])
  const [addIng, setAddIng] = useState('')
  const [addQty, setAddQty] = useState('')
  const [editQty, setEditQty] = useState<{ id: string; qty: string } | null>(null)

  const load = async () => {
    try {
      setSubRecipes(await window.api.subRecipe.listAll())
    } catch (err) {
      console.error('SubRecipesSection: failed to load', err)
    }
  }

  useEffect(() => { load() }, [])

  const openIngredients = async (id: string) => {
    setOpenSubId(id)
    setAddIng(''); setAddQty(''); setEditQty(null)
    try {
      setSubIngs(await window.api.subRecipe.listIngredients(id))
    } catch (err) {
      console.error('SubRecipesSection: failed to load ingredients', err)
    }
  }

  const closeIngredients = () => {
    setOpenSubId(null)
    setSubIngs([])
    setAddIng(''); setAddQty(''); setEditQty(null)
  }

  const reloadIngredients = async () => {
    if (!openSubId) return
    const rows = await window.api.subRecipe.listIngredients(openSubId)
    setSubIngs(rows)
    setAddIng(''); setAddQty(''); setEditQty(null)
  }

  const handleSave = async () => {
    if (!form.name.trim()) { toast({ title: 'أدخل اسم الوصفة الفرعية', variant: 'error' }); return }
    await window.api.subRecipe.upsert({ id: editId ?? undefined, name: form.name.trim(), unit: form.unit.trim() || 'وحدة' })
    toast({ title: editId ? 'تم تحديث الوصفة الفرعية' : 'تم إنشاء الوصفة الفرعية', variant: 'success' })
    setShowForm(false); setEditId(null); setForm({ name: '', unit: 'وحدة' })
    await load()
  }

  const handleDelete = async (id: string, opts?: { hard?: boolean }) => {
    await window.api.subRecipe.delete(id, opts)
    toast({ title: opts?.hard ? 'تم الحذف النهائي للوصفة الفرعية' : 'تم حذف الوصفة الفرعية', variant: 'success' })
    await load()
  }

  const handleAddIngredient = async () => {
    if (!openSubId || !addIng) return
    const qty = parseFloat(addQty)
    if (!qty || qty <= 0) { toast({ title: 'أدخل كمية صحيحة', variant: 'error' }); return }
    await window.api.subRecipe.upsertIngredient({ subRecipeId: openSubId, ingredientId: addIng, quantityPerUnit: qty })
    toast({ title: 'تمت إضافة المادة', variant: 'success' })
    await reloadIngredients()
  }

  const handleQtyCommit = async (id: string) => {
    if (!editQty || editQty.id !== id) return
    const qty = parseFloat(editQty.qty)
    if (!qty || qty <= 0) { setEditQty(null); return }
    await window.api.subRecipe.upsertIngredient({ id, subRecipeId: openSubId!, ingredientId: subIngs.find(x => x.id === id)?.ingredientId!, quantityPerUnit: qty })
    await reloadIngredients()
  }

  const handleDeleteIngredient = async (id: string) => {
    await window.api.subRecipe.deleteIngredient(id)
    toast({ title: 'تم حذف المادة', variant: 'success' })
    await reloadIngredients()
  }

  const usedIng = new Set(subIngs.map(x => x.ingredientId))

  return (
    <div className="flex-1 min-h-0 flex flex-col">
      {subRecipes.length === 0 && !showForm && (
        <div className="flex-1 p-5">
          <div className="h-full rounded-2xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-3">
            <div className="h-16 w-16 rounded-2xl bg-violet-500/10 flex items-center justify-center"><Layers className="h-8 w-8 text-violet-500" /></div>
            <p className="text-sm font-black">لا توجد وصفات فرعية</p>
            <p className="text-xs text-muted-foreground max-w-sm text-center">الوصفة الفرعية مكوّن مُحضّر مسبقاً (مثل عجينة، صوص، تتبيلة) يُعاد استخدامه داخل وصفات المنتجات. أضف مكوناتها مرة واحدة وسيُحسب ويُخصم تلقائياً في كل منتج يستخدمها.</p>
            <Button className="gap-1.5 rounded-xl" onClick={() => { setShowForm(true); setEditId(null); setForm({ name: '', unit: 'وحدة' }) }}><Plus className="h-4 w-4" /> إنشاء وصفة فرعية</Button>
          </div>
        </div>
      )}

      {subRecipes.length > 0 && (
        <div className="flex-1 p-5 overflow-auto space-y-3">
          {(showForm || editId) && (
            <div className="p-4 border-2 rounded-2xl bg-card space-y-3 animate-slide-up">
              <p className="text-xs font-black">{editId ? 'تعديل وصفة فرعية' : 'وصفة فرعية جديدة'}</p>
              <div className="grid grid-cols-2 gap-3">
                <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم الوصفة الفرعية (مثل: عجينة الكريب)" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
                <input value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} placeholder="الوحدة (مثل: حصة، وحدة)" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" dir="rtl" />
              </div>
              <div className="flex gap-2">
                <Button className="flex-1 gap-1.5 rounded-xl" onClick={handleSave}><Check className="h-4 w-4" /> {editId ? 'تحديث' : 'إنشاء'}</Button>
                <Button variant="ghost" className="rounded-xl" onClick={() => { setShowForm(false); setEditId(null); setForm({ name: '', unit: 'وحدة' }) }}>إلغاء</Button>
              </div>
            </div>
          )}

          {subRecipes.map((s) => {
            const cost = Number(s.costPerUnit) || 0
            return (
              <div key={s.id} className="rounded-2xl border border-border bg-card p-4 flex items-center gap-4">
                <div className="h-10 w-10 shrink-0 rounded-xl bg-violet-500/10 flex items-center justify-center">
                  <Layers className="h-5 w-5 text-violet-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black truncate flex items-center gap-2">
                    {s.name}
                    <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[10px] font-bold text-muted-foreground">{s.unit}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">
                    {s.ingredientCount} مادة · تكلفة الوحدة <b className="text-foreground">{fmtMoney(cost)} ج.م</b>
                  </p>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <Button variant="ghost" size="sm" className="rounded-xl gap-1 text-xs" onClick={() => openIngredients(s.id)}>
                    <Plus className="h-3.5 w-3.5" /> المكونات
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg" onClick={() => { setEditId(s.id); setShowForm(true); setForm({ name: s.name, unit: s.unit }) }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive" onClick={() => setConfirmDeleteId(s.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            )
          })}

          <div className="pt-1">
            <Button variant="ghost" size="sm" className="gap-1.5 rounded-xl text-sm border border-dashed border-border" onClick={() => { setShowForm(true); setEditId(null); setForm({ name: '', unit: 'وحدة' }) }}>
              <Plus className="h-4 w-4" /> إضافة وصفة فرعية
            </Button>
          </div>
        </div>
      )}

      {openSubId && (
        <div className="absolute top-0 right-0 h-full w-full max-w-[44rem] border-l border-border bg-card shadow-2xl flex flex-col animate-slide-in z-40" style={{ right: 0 }} onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-between px-5 py-4 border-b">
            <div>
              <p className="text-sm font-black flex items-center gap-2"><Layers className="h-4 w-4 text-violet-500" /> {subRecipes.find(s => s.id === openSubId)?.name}</p>
              <p className="text-xs text-muted-foreground mt-0.5">مكونات الوصفة الفرعية — تُخصم تلقائياً مع كل منتج يستخدمها</p>
            </div>
            <Button variant="ghost" size="icon" className="h-10 w-10 rounded-xl shrink-0" onClick={closeIngredients}><X className="h-5 w-5" /></Button>
          </div>

          <div className="px-5 py-4 space-y-4 flex-1 min-h-0 overflow-y-auto">
            <div>
              <label className="text-xs font-bold text-muted-foreground block mb-1.5">إضافة مادة</label>
              <div className="flex items-center gap-2">
                <SearchableSelect
                  value={addIng}
                  onChange={setAddIng}
                  options={ingredients.map((i) => ({ value: i.id, label: i.name, sub: i.unit, disabled: usedIng.has(i.id) }))}
                  placeholder="اختر مادة"
                  searchPlaceholder="ابحث عن مادة…"
                  className="flex-1 min-w-0"
                />
                <input type="number" inputMode="decimal" value={addQty} onChange={e => setAddQty(e.target.value)} placeholder="الكمية"
                  className="w-24 px-3 py-2.5 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" />
                <span className="shrink-0 text-xs font-bold text-muted-foreground w-10">{ingredients.find(i => i.id === addIng)?.unit || ''}</span>
                <Button size="sm" className="shrink-0 rounded-xl gap-1" onClick={handleAddIngredient} disabled={!addIng}><Plus className="h-4 w-4" /> إضافة</Button>
              </div>
            </div>

            <div className="space-y-2">
              {subIngs.length === 0 && (
                <div className="rounded-xl border border-dashed border-border py-7 text-center">
                  <p className="text-xs font-bold text-muted-foreground">لا توجد مكونات بعد</p>
                  <p className="text-[10px] text-muted-foreground/70 mt-1">أضف المواد التي تُكوِّن هذه الوصفة الفرعية</p>
                </div>
              )}
              {subIngs.map((x) => (
                <div key={x.id} className="rounded-xl border border-border bg-secondary/50 p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">{x.ingredientName}</p>
                    <p className="text-[10px] text-muted-foreground flex items-center gap-2">
                      <span>≈ {fmtMoney(Number(x.costPerUnit) || 0)} ج.م/الوحدة</span>
                      <span className="text-primary font-bold">≈ {fmtMoney(Number(x.lineCost) || 0)} ج.م</span>
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {editQty?.id === x.id ? (
                      <>
                        <input type="number" inputMode="decimal" autoFocus value={editQty.qty}
                          onChange={e => setEditQty({ id: x.id, qty: e.target.value })}
                          onBlur={() => handleQtyCommit(x.id)}
                          onKeyDown={(e) => { if (e.key === 'Enter') handleQtyCommit(x.id); if (e.key === 'Escape') setEditQty(null) }}
                          className="w-20 px-2 py-1.5 rounded-lg bg-card text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" />
                      </>
                    ) : (
                      <button type="button" onClick={() => setEditQty({ id: x.id, qty: String(x.quantityPerUnit) })}
                        className="w-20 px-2 py-1.5 rounded-lg bg-card text-sm font-bold border border-transparent hover:border-border text-center cursor-pointer">
                        {x.quantityPerUnit}
                      </button>
                    )}
                    <span className="text-[10px] text-muted-foreground w-7">{x.unit}</span>
                  </div>
                  <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive shrink-0" onClick={() => handleDeleteIngredient(x.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              ))}
            </div>
          </div>

          <div className="px-5 py-4 border-t">
            <Button variant="ghost" className="w-full rounded-xl" onClick={closeIngredients}>إغلاق</Button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="حذف الوصفة الفرعية"
        description="سيتم تعطيل هذه الوصفة الفرعية وإخفاؤها من قائمتك."
        allowHardDelete={isAdmin}
        hardDeleteDescription="يحذف الوصفة الفرعية ومكوّناتها نهائياً. لن يمكن استرجاعها."
        onConfirm={({ hard }) => { if (confirmDeleteId) { handleDelete(confirmDeleteId, { hard }); setConfirmDeleteId(null) } }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}