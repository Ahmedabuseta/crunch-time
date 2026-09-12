import { useEffect, useState } from 'react'
import { useProductStore } from '@/services/product/product.store'
import { useCategoryStore } from '@/services/category/category.store'
import { useAddonStore } from '@/services/addon/addon.store'
import { useModifierStore } from '@/services/modifier/modifier.store'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

export function ProductsPage() {
  const products = useProductStore((s) => s.products)
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

  const [showForm, setShowForm] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [form, setForm] = useState({ name: '', emoji: '', price: '', costPrice: '', categoryId: '', description: '' })
  const [selectedAddons, setSelectedAddons] = useState<string[]>([])
  const [selectedModGroups, setSelectedModGroups] = useState<string[]>([])

  useEffect(() => { fetchProducts(); fetchCategories(); fetchAddons(); fetchModifierGroups() }, [])

  const catMap = new Map(categories.map(c => [c.id, c]))

  const resetForm = () => {
    setForm({ name: '', emoji: '', price: '', costPrice: '', categoryId: '', description: '' })
    setSelectedAddons([]); setSelectedModGroups([]); setEditId(null); setShowForm(false)
  }

  const handleCreate = async () => {
    if (!form.name || !form.price || !form.categoryId) return
    await createProduct({ name: form.name, emoji: form.emoji || '🍽️', price: parseFloat(form.price), costPrice: parseFloat(form.costPrice) || 0, categoryId: form.categoryId, description: form.description })
    resetForm()
  }

  const handleUpdate = async () => {
    if (!editId || !form.name) return
    await updateProduct(editId, { name: form.name, emoji: form.emoji, price: parseFloat(form.price), costPrice: parseFloat(form.costPrice) || 0, categoryId: form.categoryId, description: form.description })
    resetForm()
  }

  const startEdit = (p: any) => {
    setEditId(p.id); setShowForm(false)
    setForm({ name: p.name, emoji: p.emoji, price: String(p.price), costPrice: String(p.costPrice || 0), categoryId: p.categoryId, description: p.description })
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">المنتجات ({products.length})</h2>
        <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => { showForm ? resetForm() : setShowForm(true); setEditId(null) }}>
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showForm ? 'إغلاق' : 'إضافة منتج'}
        </Button>
      </div>

      {/* Add / Edit form */}
      {(showForm || editId) && (
        <div className="mx-5 mt-4 p-4 border-2 rounded-2xl bg-card space-y-3 animate-slide-up">
          <div className="grid grid-cols-2 gap-3">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم المنتج" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />
            <input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} placeholder="🍔" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" />
            <input type="number" value={form.price} onChange={e => setForm(f => ({ ...f, price: e.target.value }))} placeholder="السعر (ج.م)" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
            <input type="number" value={form.costPrice} onChange={e => setForm(f => ({ ...f, costPrice: e.target.value }))} placeholder="التكلفة (ج.م)" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" />
          </div>

          {/* Category select */}
          <select value={form.categoryId} onChange={e => setForm(f => ({ ...f, categoryId: e.target.value }))} className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none">
            <option value="">اختر القسم</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.emoji} {c.name}</option>)}
          </select>

          <input value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="الوصف" className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none" dir="rtl" />

          {/* Addon multi-select */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground mb-1.5">الإضافات المتاحة:</p>
            <div className="flex flex-wrap gap-1.5">
              {addons.map(a => {
                const selected = selectedAddons.includes(a.id)
                return (
                  <button key={a.id} onClick={() => setSelectedAddons(s => selected ? s.filter(id => id !== a.id) : [...s, a.id])}
                    className={cn("px-2.5 py-1 rounded-full text-[10px] font-bold border transition-all cursor-pointer",
                      selected ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-transparent hover:border-border")}>
                    {a.emoji} {a.name}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Modifier group multi-select */}
          <div>
            <p className="text-[10px] font-bold text-muted-foreground mb-1.5">مجموعات الموديفاير:</p>
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
          </div>

          <div className="flex gap-2">
            <Button className="flex-1 rounded-xl" onClick={editId ? handleUpdate : handleCreate}>{editId ? 'تحديث' : 'إضافة'}</Button>
            {editId && <Button variant="ghost" className="rounded-xl" onClick={resetForm}>إلغاء</Button>}
          </div>
        </div>
      )}

      <ScrollArea className="flex-1 p-5">
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
          {products.map(p => (
            <div key={p.id} className="border-2 rounded-2xl bg-card p-4 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-3xl">{p.emoji}</span>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg" onClick={() => startEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => removeProduct(p.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                </div>
              </div>
              <p className="font-bold text-sm">{p.name}</p>
              <p className="text-xs text-muted-foreground">{p.description}</p>
              <div className="flex items-center justify-between">
                <span className="text-xs bg-secondary rounded-full px-2 py-0.5">{catMap.get(p.categoryId)?.name}</span>
                <div className="text-right">
                  <span className="font-black text-primary text-sm">{p.price} ج.م</span>
                  {p.costPrice > 0 && <span className="text-[10px] text-muted-foreground block">تكلفة: {p.costPrice}</span>}
                </div>
              </div>
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
