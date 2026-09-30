import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Ingredient } from '@/services/inventory/inventory.types'
import { Button } from '@/components/ui/button'
import { toast } from '@/components/ui/toast'
import { SearchableSelect } from '@/components/ui/searchable-select'
import { ConfirmDialog } from '@/components/ui/confirm-dialog'
import { fmtMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import { Plus, Trash2, Check, Package, X, AlertTriangle, Layers } from 'lucide-react'

interface RecipePanelProps {
  title: string
  targetId: string
  entityField: 'productId' | 'addonId' | 'modifierId'
  ingredients: Ingredient[]
  fetchRecipes: (id: string) => Promise<any[]>
  upsertRecipe: (data: any) => Promise<string>
  deleteRecipe: (id: string) => Promise<any>
  onChanged?: () => void
  onClose?: () => void
  sellingPrice?: number
}

type DraftKind = 'ingredient' | 'sub-recipe'

export function RecipePanel({ title, targetId, entityField, ingredients, fetchRecipes, upsertRecipe, deleteRecipe, onChanged, onClose, sellingPrice }: RecipePanelProps) {
  const [recipes, setRecipes] = useState<any[]>([])
  const [subRecipes, setSubRecipes] = useState<{ id: string; name: string; unit: string; active: boolean }[]>([])
  const [draftOpen, setDraftOpen] = useState(false)
  const [draftKind, setDraftKind] = useState<DraftKind>('ingredient')
  const [draftIng, setDraftIng] = useState('')
  const [draftSub, setDraftSub] = useState('')
  const [draftQty, setDraftQty] = useState('')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const loadSubRecipes = async () => {
    try {
      const all = await window.api.subRecipe.listAll()
      setSubRecipes(all.filter((s) => s.active))
    } catch (err) {
      console.error('RecipePanel: failed to load sub-recipes', err)
    }
  }

  const reload = async () => {
    if (!targetId) { setRecipes([]); return }
    try {
      setRecipes(await fetchRecipes(targetId))
    } catch (err) {
      console.error('RecipePanel: failed to load recipes', targetId, err)
    }
  }

  useEffect(() => {
    setDraftOpen(false); setDraftIng(''); setDraftSub(''); setDraftQty('')
    reload()
  }, [targetId])

  useEffect(() => { loadSubRecipes() }, [])

  const openDraft = (kind: DraftKind) => {
    setDraftKind(kind)
    setDraftIng(''); setDraftSub(''); setDraftQty('')
    setDraftOpen(true)
  }

  const lineCost = (r: any) => {
    if (typeof r.lineCost === 'number') return r.lineCost
    const ing = ingredients.find(i => i.id === r.ingredientId)
    return ing ? ing.costPerUnit * r.quantityPerUnit : 0
  }

  const totalCost = recipes.reduce((sum, r) => sum + lineCost(r), 0)

  const isSub = (r: any) => !!r.subRecipeId

  const handleUpsert = async (row: any, patch: any) => {
    await upsertRecipe({ id: row.id, [entityField]: targetId, ...row, ...patch })
    await reload()
    onChanged?.()
  }

  const handleAdd = async () => {
    const qty = parseFloat(draftQty) || 0
    if (draftKind === 'sub-recipe') {
      if (!draftSub) return
      const sub = subRecipes.find(s => s.id === draftSub)
      await upsertRecipe({ [entityField]: targetId, subRecipeId: draftSub, ingredientId: null, quantityPerUnit: qty })
      toast({ title: 'تمت إضافة الوصفة الفرعية', description: sub ? `${sub.name} (${sub.unit})` : undefined, variant: 'success' })
    } else {
      if (!draftIng) return
      const ing = ingredients.find(i => i.id === draftIng)
      await upsertRecipe({ [entityField]: targetId, ingredientId: draftIng, subRecipeId: null, quantityPerUnit: qty })
      toast({ title: 'تمت إضافة المكون', description: ing ? `${ing.name} (${ing.unit})` : undefined, variant: 'success' })
    }
    setDraftOpen(false); setDraftIng(''); setDraftSub(''); setDraftQty('')
    await reload()
    onChanged?.()
  }

  const handleDelete = async (id: string) => {
    await deleteRecipe(id)
    toast({ title: 'تم حذف المكون', variant: 'success' })
    await reload()
    onChanged?.()
  }

  const unitFor = (r: any) => (isSub(r) ? r.subRecipeUnit : r.unit) || ingredients.find(i => i.id === r.ingredientId)?.unit || ''
  const nameFor = (r: any) => (isSub(r) ? r.subRecipeName : r.ingredientName) || ingredients.find(i => i.id === r.ingredientId)?.name || ''

  const usedInRecipe = new Set(recipes.map(r => r.ingredientId))
  const otherUsedIds = (rowId: string) => new Set(recipes.filter(o => o.id !== rowId).map(o => o.ingredientId))
  const optionFor = (i: Ingredient, disabled: boolean) => ({ value: i.id, label: i.name, sub: i.unit, disabled })

  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 px-4 pt-4 pb-3 bg-card border-b border-border/60">
        <div className="flex items-center gap-2 min-w-0">
          <p className="text-sm font-black truncate">{title}</p>
          {recipes.length > 0 && (
            <span className={cn(
              "shrink-0 rounded-full px-3 py-1 text-xs font-bold",
              sellingPrice && totalCost > sellingPrice
                ? "bg-destructive/10 text-destructive"
                : "bg-primary/10 text-primary"
            )}>
              ≈ {fmtMoney(totalCost)} ج.م
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onClose && (
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-xl shrink-0" onClick={onClose}><X className="h-4 w-4" /></Button>
          )}
          <Button variant="ghost" size="sm" className="shrink-0 gap-1 rounded-xl text-sm border border-dashed border-border" onClick={() => openDraft('ingredient')}>
            <Plus className="h-4 w-4" /> إضافة مكون
          </Button>
          <Button variant="ghost" size="sm" className="shrink-0 gap-1 rounded-xl text-sm border border-dashed border-violet-400/50 text-violet-500" onClick={() => openDraft('sub-recipe')}>
            <Layers className="h-4 w-4" /> وصفة فرعية
          </Button>
        </div>
      </div>

      {sellingPrice && totalCost > sellingPrice && (
        <div className="px-4 pt-3">
          <div className="flex items-center gap-2 rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-[11px] font-bold text-destructive">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>تكلفة الوصفة ({fmtMoney(totalCost)} ج.م) أعلى من سعر البيع ({fmtMoney(sellingPrice)} ج.م)</span>
          </div>
        </div>
      )}

      <div className="px-4 py-3 space-y-3">
        {recipes.length === 0 && (
          <div className="rounded-xl border border-dashed border-border py-7 flex flex-col items-center gap-2">
            <Package className="h-7 w-7 text-muted-foreground/40" />
            <p className="text-xs font-bold text-muted-foreground">لا توجد مكونات بعد</p>
            <p className="text-[10px] text-muted-foreground/70">أضف مكونات لتتبع تكلفة الوصفة وخصم المخزون تلقائياً عند البيع</p>
          </div>
        )}

        {recipes.length > 0 && (
          <div className="space-y-2">
            {recipes.map(r => {
              const cost = lineCost(r)
              const overpriced = sellingPrice ? cost > sellingPrice : false
              return (
              <div key={r.id} className={cn(
                "rounded-xl border p-2.5 space-y-1.5",
                isSub(r)
                  ? "border-violet-400/40 bg-violet-500/5"
                  : overpriced ? "border-destructive/50 bg-destructive/5" : "border-border bg-secondary/50"
              )}>
                <div className="flex items-center gap-2.5">
                <span className={cn(
                  "h-9 w-9 shrink-0 rounded-lg bg-card border border-border flex items-center justify-center text-lg",
                  isSub(r) && "text-violet-500"
                )}>
                  {isSub(r) ? <Layers className="h-4.5 w-4.5" /> : '📦'}
                </span>
                {isSub(r) ? (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold truncate">{nameFor(r)}</span>
                      <span className="shrink-0 rounded-full bg-violet-500/10 text-violet-500 px-2 py-0.5 text-[9px] font-bold">وصفة فرعية</span>
                    </div>
                  </div>
                ) : (
                  <SearchableSelect
                    value={r.ingredientId}
                    onChange={(v) => handleUpsert(r, { ingredientId: v })}
                    options={ingredients.map((i) => optionFor(i, otherUsedIds(r.id).has(i.id)))}
                    placeholder="اختر مادة"
                    className="flex-1 min-w-0"
                  />
                )}
                <div className="flex items-center gap-1.5 shrink-0">
                  <input type="number" value={r.quantityPerUnit} onChange={e => handleUpsert(r, { quantityPerUnit: parseFloat(e.target.value) || 0 })}
                    className="w-20 px-2 py-2 rounded-lg bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" />
                  <span className="text-[10px] text-muted-foreground w-7">{unitFor(r)}</span>
                </div>
                <span title={nameFor(r)} className={cn(
                  "text-xs shrink-0 hidden sm:block min-w-[52px] text-left",
                  overpriced ? "text-destructive font-bold" : "text-muted-foreground"
                )}>
                  ≈ {fmtMoney(cost)}
                </span>
                <Button variant="ghost" size="icon" className="h-8 w-8 rounded-lg text-destructive shrink-0" onClick={() => setConfirmDeleteId(r.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
                {overpriced && (
                  <div className="flex items-center gap-1.5 text-[10px] font-bold text-destructive">
                    <AlertTriangle className="h-3 w-3 shrink-0" />
                    <span className="truncate">
                      تكلفة "{nameFor(r)}" ({fmtMoney(cost)} ج.م) تتجاوز سعر البيع ({fmtMoney(sellingPrice!)} ج.م)
                    </span>
                  </div>
                )}
              </div>
              )
            })}
          </div>
        )}
      </div>

      {draftOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => { setDraftOpen(false); setDraftIng(''); setDraftSub(''); setDraftQty('') }}>
          <div className="bg-card border-2 rounded-3xl shadow-2xl w-[440px] max-w-[92vw] max-h-[85vh] flex flex-col overflow-hidden" dir="rtl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between p-5 pb-3">
              <h3 className="font-black text-base">{draftKind === 'sub-recipe' ? 'إضافة وصفة فرعية للوصفة' : 'إضافة مكون للوصفة'}</h3>
              <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl shrink-0" onClick={() => { setDraftOpen(false); setDraftIng(''); setDraftSub(''); setDraftQty('') }}>
                <X className="h-5 w-5" />
              </Button>
            </div>

            <div className="px-5 pb-4">
              <div className="flex items-center gap-1 p-1 rounded-2xl bg-secondary">
                <button type="button" onClick={() => setDraftKind('ingredient')}
                  className={cn("flex-1 py-2 rounded-xl text-xs font-bold transition-colors", draftKind === 'ingredient' ? "bg-card shadow text-foreground" : "text-muted-foreground")}>
                  مكون
                </button>
                <button type="button" onClick={() => setDraftKind('sub-recipe')}
                  className={cn("flex-1 py-2 rounded-xl text-xs font-bold transition-colors", draftKind === 'sub-recipe' ? "bg-card shadow text-violet-500" : "text-muted-foreground")}>
                  وصفة فرعية
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 space-y-4 pb-4">
              {draftKind === 'sub-recipe' ? (
                <div>
                  <label className="text-xs font-bold text-muted-foreground block mb-1.5">الوصفة الفرعية</label>
                  {subRecipes.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-border py-4 text-center">
                      <p className="text-[11px] font-bold text-muted-foreground">لا توجد وصفات فرعية بعد</p>
                      <p className="text-[10px] text-muted-foreground/70 mt-1">أنشئها أولاً من قسم «المخزون ← وصفات فرعية»</p>
                    </div>
                  ) : (
                    <SearchableSelect
                      value={draftSub}
                      onChange={(v) => { setDraftSub(v); setDraftIng('') }}
                      options={subRecipes.map((s) => ({ value: s.id, label: s.name, sub: s.unit }))}
                      placeholder="اختر وصفة فرعية"
                      searchPlaceholder="ابحث عن وصفة فرعية…"
                    />
                  )}
                </div>
              ) : (
                <div>
                  <label className="text-xs font-bold text-muted-foreground block mb-1.5">المادة</label>
                  <SearchableSelect
                    value={draftIng}
                    onChange={(v) => { setDraftIng(v); setDraftSub('') }}
                    options={ingredients.map((i) => optionFor(i, usedInRecipe.has(i.id)))}
                    placeholder="اختر مادة"
                    searchPlaceholder="ابحث عن مادة…"
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-bold text-muted-foreground block mb-1.5">الكمية لكل وحدة</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    inputMode="decimal"
                    autoFocus
                    value={draftQty}
                    onChange={e => setDraftQty(e.target.value)}
                    placeholder="مثال: 1"
                    className="flex-1 px-3 py-2.5 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center"
                  />
                  <span className="shrink-0 text-xs font-bold text-muted-foreground">
                    {draftKind === 'sub-recipe'
                      ? subRecipes.find(s => s.id === draftSub)?.unit || ''
                      : ingredients.find(i => i.id === draftIng)?.unit || ''}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-5 pt-3 border-t">
              <div className="flex items-center gap-2">
                <Button className="flex-1 rounded-2xl h-12 text-base font-black gap-1.5" onClick={handleAdd} disabled={(draftKind === 'sub-recipe' ? !draftSub : !draftIng)}>
                  <Check className="h-5 w-5" /> {draftKind === 'sub-recipe' ? 'إضافة الوصفة الفرعية' : 'إضافة المكون'}
                </Button>
                <Button variant="ghost" className="rounded-2xl h-12 px-5 text-sm" onClick={() => { setDraftOpen(false); setDraftIng(''); setDraftSub(''); setDraftQty('') }}>
                  <X className="h-4 w-4" /> إلغاء
                </Button>
              </div>
            </div>
          </div>
        </div>
        , document.body
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        title="حذف المكون"
        description="سيتم حذف هذا المكون من الوصفة."
        onConfirm={() => { if (confirmDeleteId) { handleDelete(confirmDeleteId); setConfirmDeleteId(null) } }}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  )
}