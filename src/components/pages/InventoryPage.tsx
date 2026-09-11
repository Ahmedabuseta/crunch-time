import { useEffect, useState } from 'react'
import { useInventoryStore } from '@/services/inventory/inventory.store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Package, AlertTriangle, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function InventoryPage() {
  const ingredients = useInventoryStore((s) => s.ingredients)
  const alerts = useInventoryStore((s) => s.alerts)
  const fetchIngredients = useInventoryStore((s) => s.fetchIngredients)
  const fetchAlerts = useInventoryStore((s) => s.fetchAlerts)
  const restock = useInventoryStore((s) => s.restock)
  const createIngredient = useInventoryStore((s) => s.createIngredient)
  const [restockId, setRestockId] = useState<string | null>(null)
  const [restockQty, setRestockQty] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', unit: 'g', stockQuantity: '', minStock: '', costPerUnit: '' })

  useEffect(() => { fetchIngredients(); fetchAlerts() }, [])

  const alertIds = new Set(alerts.map(a => a.id))

  const handleRestock = async () => {
    if (restockId && restockQty) {
      await restock(restockId, parseFloat(restockQty), 'إعادة تعبئة يدوية')
      setRestockId(null)
      setRestockQty('')
    }
  }

  const handleCreate = async () => {
    if (!form.name || !form.unit) return
    await createIngredient({ name: form.name, unit: form.unit, stockQuantity: parseFloat(form.stockQuantity) || 0, minStock: parseFloat(form.minStock) || 0, costPerUnit: parseFloat(form.costPerUnit) || 0 })
    setForm({ name: '', unit: 'g', stockQuantity: '', minStock: '', costPerUnit: '' })
    setShowForm(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">المخزون</h2>
        <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showForm ? 'إغلاق' : 'إضافة مادة'}
        </Button>
      </div>

      {showForm && (
        <div className="mx-5 mt-4 p-4 border-2 rounded-2xl bg-card space-y-3 animate-slide-up">
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المادة" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
            <select value={form.unit} onChange={e => setForm(f => ({ ...f, unit: e.target.value }))} className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none">
              <option value="g">جرام (g)</option>
              <option value="kg">كيلو (kg)</option>
              <option value="ml">مليلتر (ml)</option>
              <option value="l">لتر (l)</option>
              <option value="pcs">قطعة (pcs)</option>
            </select>
            <input type="number" value={form.stockQuantity} onChange={e => setForm(f => ({ ...f, stockQuantity: e.target.value }))} placeholder="الكمية الحالية" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
            <input type="number" value={form.minStock} onChange={e => setForm(f => ({ ...f, minStock: e.target.value }))} placeholder="الحد الأدنى" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
            <input type="number" value={form.costPerUnit} onChange={e => setForm(f => ({ ...f, costPerUnit: e.target.value }))} placeholder="التكلفة/الوحدة" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none col-span-2" />
          </div>
          <Button className="w-full rounded-xl" onClick={handleCreate}>إضافة</Button>
        </div>
      )}

      {alerts.length > 0 && (
        <div className="mx-5 mt-3 p-3 bg-yellow-500/10 border-2 border-yellow-500/30 rounded-xl flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-yellow-500 shrink-0" />
          <p className="text-xs font-bold text-yellow-500">⚠️ {alerts.length} مواد تحت الحد الأدنى: {alerts.map(a => a.name).join('، ')}</p>
        </div>
      )}

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
                {restockId === ing.id ? (
                  <div className="flex items-center gap-1">
                    <input type="number" value={restockQty} onChange={e => setRestockQty(e.target.value)} placeholder="الكمية" className="w-20 px-2 py-1.5 rounded-lg bg-secondary text-xs border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" />
                    <Button size="sm" className="rounded-lg text-xs" onClick={handleRestock}>إضافة</Button>
                    <Button variant="ghost" size="sm" className="rounded-lg text-xs" onClick={() => setRestockId(null)}>إلغاء</Button>
                  </div>
                ) : (
                  <Button variant="outline" size="sm" className="rounded-lg text-xs gap-1" onClick={() => { setRestockId(ing.id); setRestockQty('') }}>
                    <Plus className="h-3 w-3" /> تعبئة
                  </Button>
                )}
              </div>
            )
          })}
        </div>
      </ScrollArea>
    </div>
  )
}
