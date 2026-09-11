import { useEffect } from 'react'
import { useModifierStore } from '@/services/modifier/modifier.store'
import { Button } from '@/components/ui/button'
import { Plus, Pencil, Trash2 } from 'lucide-react'

export function ModifiersPage() {
  const groups = useModifierStore((s) => s.groups)
  const fetchGroups = useModifierStore((s) => s.fetchGroups)
  const removeGroup = useModifierStore((s) => s.removeGroup)
  const removeModifier = useModifierStore((s) => s.removeModifier)

  useEffect(() => { fetchGroups() }, [])

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-5 py-4 border-b">
        <h2 className="text-base font-black">الموديفاير</h2>
        <Button size="sm" className="gap-1.5 rounded-xl"><Plus className="h-4 w-4" /> إضافة مجموعة</Button>
      </div>
      <div className="flex-1 p-5 space-y-4">
        {groups.map(g => (
          <div key={g.id} className="border-2 rounded-2xl bg-card overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-sm">{g.name}</h3>
                <span className="text-[10px] bg-secondary rounded-full px-2 py-0.5 text-muted-foreground">
                  {g.type === 'single-select' ? 'اختيار واحد' : 'اختيار متعدد'}
                </span>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg"><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 rounded-lg text-destructive" onClick={() => removeGroup(g.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
            <div className="p-3 space-y-1.5">
              {g.modifiers.map(m => (
                <div key={m.id} className="flex items-center justify-between px-3 py-2 rounded-xl bg-secondary/60">
                  <span className="text-sm font-medium">{m.name}</span>
                  <div className="flex items-center gap-2">
                    {m.priceAdjustment > 0 && <span className="text-xs font-bold text-primary">+{m.priceAdjustment} ج.م</span>}
                    {m.priceAdjustment === 0 && <span className="text-xs text-muted-foreground">بدون زيادة</span>}
                    <Button variant="ghost" size="icon" className="h-6 w-6 rounded-lg text-destructive" onClick={() => removeModifier(m.id)}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                </div>
              ))}
              <Button variant="ghost" size="sm" className="w-full gap-1 rounded-xl text-xs mt-2"><Plus className="h-3 w-3" /> إضافة خيار</Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
