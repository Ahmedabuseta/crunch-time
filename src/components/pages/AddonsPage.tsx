import { useEffect } from 'react'
import { useAddonStore } from '@/services/addon/addon.store'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2 } from 'lucide-react'

export function AddonsPage() {
  const addons = useAddonStore((s) => s.addons)
  const fetch = useAddonStore((s) => s.fetch)
  const remove = useAddonStore((s) => s.remove)

  useEffect(() => { fetch() }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">الإضافات</h2>
        <Button size="sm" className="gap-1.5 rounded-xl"><Plus className="h-4 w-4" /> إضافة</Button>
      </div>
      <div className="flex-1 p-5 grid grid-cols-2 lg:grid-cols-4 gap-3">
        {addons.map(a => (
          <div key={a.id} className="border-2 rounded-2xl bg-card p-4 flex flex-col items-center gap-2">
            <span className="text-3xl">{a.emoji}</span>
            <p className="font-bold text-sm">{a.name}</p>
            <p className="font-black text-primary text-sm">{a.price} ج.م</p>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg"><Pencil className="h-3.5 w-3.5" /></Button>
              <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => remove(a.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
