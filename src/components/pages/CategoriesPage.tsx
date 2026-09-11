import { useEffect, useState } from 'react'
import { useCategoryStore } from '@/services/category/category.store'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2, GripVertical, X } from 'lucide-react'

export function CategoriesPage() {
  const categories = useCategoryStore((s) => s.categories)
  const fetch = useCategoryStore((s) => s.fetch)
  const create = useCategoryStore((s) => s.create)
  const remove = useCategoryStore((s) => s.remove)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ name: '', emoji: '', color: '#ff6b35' })

  useEffect(() => { fetch() }, [])

  const handleCreate = async () => {
    if (!form.name) return
    await create({ name: form.name, emoji: form.emoji || '📦', color: form.color })
    setForm({ name: '', emoji: '', color: '#ff6b35' })
    setShowForm(false)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">الأقسام</h2>
        <Button size="sm" className="gap-1.5 rounded-xl" onClick={() => setShowForm(!showForm)}>
          {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />} {showForm ? 'إغلاق' : 'إضافة قسم'}
        </Button>
      </div>

      {showForm && (
        <div className="mx-5 mt-4 p-4 border-2 rounded-2xl bg-card space-y-3 animate-slide-up">
          <div className="grid grid-cols-3 gap-3">
            <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="اسم القسم" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none col-span-2" dir="rtl" />
            <input value={form.emoji} onChange={e => setForm(f => ({ ...f, emoji: e.target.value }))} placeholder="ايموجي" className="px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center" />
          </div>
          <Button className="w-full rounded-xl" onClick={handleCreate}>إضافة</Button>
        </div>
      )}

      <div className="flex-1 p-5 space-y-2">
        {categories.map((cat, i) => (
          <div key={cat.id} className="flex items-center gap-3 border-2 rounded-xl bg-card p-3">
            <GripVertical className="h-4 w-4 text-muted-foreground" />
            <span className="text-2xl">{cat.emoji}</span>
            <span className="flex-1 font-bold text-sm">{cat.name}</span>
            <span className="text-xs text-muted-foreground">ترتيب: {i + 1}</span>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg"><Pencil className="h-3.5 w-3.5" /></Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => remove(cat.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
          </div>
        ))}
      </div>
    </div>
  )
}
