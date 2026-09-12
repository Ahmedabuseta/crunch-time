import { useEffect, useState } from 'react'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { useProductStore } from '@/services/product/product.store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Package, AlertTriangle, X, Pencil, Trash2, Link } from 'lucide-react'
import { cn } from '@/lib/utils'

export function InventoryPage() {
  const ingredients = useInventoryStore((s) => s.ingredients)
  const alerts = useInventoryStore((s) => s.alerts)
  const fetchIngredients = useInventoryStore((s) => s.fetchIngredients)
  const fetchAlerts = useInventoryStore((s) => s.fetchAlerts)
  const restock = useInventoryStore((s) => s.restock)
  const createIngredient = useInventoryStore((s) => s.createIngredient)
  const updateIngredient = useInventoryStore((s) => s.updateIngredient)
  const fetchRecipes = useInventoryStore((s) => s.fetchRecipes)
  const upsertRecipe = useInventoryStore((s) => s.upsertRecipe)
  const deleteRecipe = useInventoryStore((s) => s.deleteRecipe)
  const products = useProductStore((s) => s.products)
  const fetchProducts = useProductStore((s) => s.fetch)

  const [showIngForm, setShowIngForm] = useState(false)
  const [editIngId, setEditIngId] = useState<string | null>(null)
  const [ingForm, setIngForm] = useState({ name: '', unit: 'g', stockQuantity: '', minStock: '', costPerUnit: '' })
  const [restockId, setRestockId] = useState<string | null>(null)
  const [restockQty, setRestockQty] = useState('')
  const [showRecipeEditor, setShowRecipeEditor] = useState(false)
  const [recipeProductId, setRecipeProductId] = useState('')
  const [recipes, setRecipes] = useState<any[]>([])

  useEffect(() => { fetchIngredients(); fetchAlerts(); fetchProducts() }, [])

  const alertIds = new Set(alerts.map(a => a.id))
  const resetIngForm = () => { setIngForm({ name: '', unit: 'g', stockQuantity: '', minStock: '', costPerUnit: '' }); setEditIngId(null); setShowIngForm(false) }

  const handleCreateIng = async () => {
    if (!ingForm.name || !ingForm.unit) return
    await createIngredient({ name: ingForm.name, unit: ingForm.unit, stockQuantity: parseFloat(ingForm.stockQuantity) || 0, minStock: parseFloat(ingForm.minStock) || 0, costPerUnit: parseFloat(ingForm.costPerUnit) || 0 })
    resetIngForm()
  }

  const handleUpdateIng = async () => {
    if (!editIngId || !ingForm.name) return
    await updateIngredient(editIngId, { name: ingForm.name, unit: ingForm.unit, minStock: parseFloat(ingForm.minStock) || 0, costPerUnit: parseFloat(ingForm.costPerUnit) || 0 })
    resetIngForm()
  }

  const startEditIng = (i: any) => {
    setEditIngId(i.id); setShowIngForm(false)
    setIngForm({ name: i.name, unit: i.unit, stockQuantity: String(i.stockQuantity), minStock: String(i.minStock), costPerUnit: String(i.costPerUnit) })
  }

  const handleRestock = async () => {
    if (restockId && restockQty) {
      await restock(restockId, parseFloat(restockQty), 'إعادة تعبئة يدوية')
      setRestockId(null); setRestockQty('')
    }
  }

  const loadRecipes = async (productId: string) => {
    setRecipeProductId(productId)
    const r = await fetchRecipes(productId)
    setRecipes(r)
  }

  const handleAddRecipe = async () => {
    if (!recipeProductId) return
    await upsertRecipe({ productId: recipeProductId, ingredientId: '', quantityPerUnit: 0 })
    const r = await fetchRecipes(recipeProductId)
    setRecipes(r)
  }

  const handleUpdateRecipe = async (recipeId: string, ingredientId: string, qty: number) => {
    await upsertRecipe({ id: recipeId, productId: recipeProductId, ingredientId, quantityPerUnit: qty })
    const r = await fetchRecipes(recipeProductId)
    setRecipes(r)
  }

  const handleDeleteRecipe = async (recipeId: string) => {
    await deleteRecipe(recipeId)
    const r = await fetchRecipes(recipeProductId)
    setRecipes(r)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">المخزون ({ingredients.length} مادة)</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="gap-1.5 rounded-xl" onClick={() => { setShowRecipeEditor(!showRecipeEditor); setShowIngForm(false) }}>
            <Link className="h-4 w-4" /> {showRecipeEditor ? 'إغلاق الوصفات' : 'الوصفات'}
          </Button>
          <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => { showIngForm ? resetIngForm() : setShowIngForm(true); setEditIngId(null) }}>
            {showIngForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showIngForm ? 'إغلاق' : 'إضافة مادة'}
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <div className="mx-5 mt-3 p-3 bg-yellow-500/10 border-2 border-yellow-500/30 rounded-xl flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
          <p className="text-xs font-bold text-yellow-500">⚠️ {alerts.length} مواد تحت الحد الأدنى: {alerts.map(a => a.name).join('، ')}</p>
        </div>
      )}

      {/* Ingredient form */}
      {(showIngForm || editIngId) && (
        <div className="mx-5 mt-3 p-4 border-2 rounded-2xl bg-card space-y-3 animate-slide-up">
          <div className="grid grid-cols-2 gap-3">
            <input value={ingForm.name} onChange={e => setIngForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المادة" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
            <select value={ingForm.unit} onChange={e => setIngForm(f => ({ ...f, unit: e.target.value }))} className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none">
              <option value="g">جرام (g)</option>
              <option value="kg">كيلو (kg)</option>
              <option value="ml">مليلتر (ml)</option>
              <option value="l">لتر (l)</option>
              <option value="pcs">قطعة (pcs)</option>
            </select>
            <input type="number" value={ingForm.stockQuantity} onChange={e => setIngForm(f => ({ ...f, stockQuantity: e.target.value }))} placeholder="الكمية الحالية" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" disabled={!!editIngId} />
            <input type="number" value={ingForm.minStock} onChange={e => setIngForm(f => ({ ...f, minStock: e.target.value }))} placeholder="الحد الأدنى" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
            <input type="number" value={ingForm.costPerUnit} onChange={e => setIngForm(f => ({ ...f, costPerUnit: e.target.value }))} placeholder="التكلفة/الوحدة" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none col-span-2" />
          </div>
          <div className="flex gap-2">
            <Button className="flex-1 rounded-xl" onClick={editIngId ? handleUpdateIng : handleCreateIng}>{editIngId ? 'تحديث' : 'إضافة'}</Button>
            {editIngId && <Button variant="ghost" className="rounded-xl" onClick={resetIngForm}>إلغاء</Button>}
          </div>
        </div>
      )}

      {/* Recipe editor */}
      {showRecipeEditor && (
        <div className="mx-5 mt-3 p-4 border-2 border-blue-500/20 rounded-2xl bg-blue-500/5 space-y-3 animate-slide-up">
          <h3 className="text-sm font-black">editor الوصفات</h3>
          <p className="text-[10px] text-muted-foreground">اختر منتج ثم أضف المكونات مع الكمية المطلوبة لكل وحدة</p>

          {/* Product select */}
          <select value={recipeProductId} onChange={e => { loadRecipes(e.target.value) }} className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none">
            <option value="">اختر منتج</option>
            {products.map(p => <option key={p.id} value={p.id}>{p.emoji} {p.name}</option>)}
          </select>

          {/* Recipe items */}
          {recipeProductId && (
            <div className="space-y-2">
              {recipes.map(r => {
                const ing = ingredients.find(i => i.id === r.ingredientId)
                return (
                  <div key={r.id} className="flex items-center gap-2 bg-secondary/60 rounded-xl p-2">
                    <span className="text-sm">{ing?.emoji || '📦'}</span>
                    <select value={r.ingredientId} onChange={e => handleUpdateRecipe(r.id, e.target.value, r.quantityPerUnit)} className="flex-1 px-2 py-1 rounded-lg bg-secondary text-xs border-0 focus:ring-1 focus:ring-primary focus:outline-none">
                      <option value="">اختر مادة</option>
                      {ingredients.map(i => <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>)}
                    </select>
                    <input type="number" value={r.quantityPerUnit} onChange={e => handleUpdateRecipe(r.id, r.ingredientId, parseFloat(e.target.value) || 0)} className="w-20 px-2 py-1 rounded-lg bg-secondary text-xs border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" />
                    <span className="text-[10px] text-muted-foreground">{ing?.unit || ''}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-destructive" onClick={() => handleDeleteRecipe(r.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                )
              })}
              <Button variant="ghost" size="sm" className="w-full gap-1 rounded-xl text-xs" onClick={handleAddRecipe}>
                <Plus className="h-3 w-3" /> إضافة مكون
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Ingredients list */}
      <ScrollArea className="flex-1 p-5">
        <div className="space-y-2">
          {ingredients.map(ing => {
            const isLow = alertIds.has(ing.id)
            const percentage = ing.minStock > 0 ? (ing.stockQuantity / (ing.minStock * 5)) * 100 : 100
            return (
              <div key={ing.id} className={cn("border-2 rounded-xl bg-card p-4 flex items-center gap-4", isLow && "border-yellow-500/30")}>
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center", isLow ? "bg-yellow-500/10" : "bg-secondary")}>
                  <Package className={cn("h-5 w-5", isLow ? "text-yellow-500" : "text-muted-foreground")} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold">{ing.name}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                      <div className={cn("h-full rounded-full transition-all", isLow ? "bg-yellow-500" : "bg-primary")} style={{ width: `${Math.min(percentage, 100)}%` }} />
                    </div>
                    <span className="text-xs font-bold text-muted-foreground w-20 text-left">{ing.stockQuantity} / {ing.minStock * 5} {ing.unit}</span>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">الحد الأدنى: {ing.minStock} {ing.unit}</p>
                  <p className="text-xs text-muted-foreground">التكلفة: {ing.costPerUnit} ج.م/{ing.unit}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => startEditIng(ing)}><Pencil className="h-3.5 w-3.5" /></Button>
                  {restockId === ing.id ? (
                    <div className="flex items-center gap-1">
                      <input type="number" value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="الكمية" className="w-16 px-2 py-1 rounded-lg bg-secondary text-xs border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" />
                      <Button size="sm" className="rounded-lg text-xs" onClick={handleRestock}>+</Button>
                      <Button variant="ghost" size="sm" className="rounded-lg text-xs" onClick={() => setRestockId(null)}>×</Button>
                    </div>
                  ) : (
                    <Button variant="outline" size="sm" className="rounded-lg text-xs gap-1" onClick={() => { setRestockId(ing.id); setRestockQty('') }}>
                      <Plus className="h-3 w-3" /> تعبئة
                    </Button>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
