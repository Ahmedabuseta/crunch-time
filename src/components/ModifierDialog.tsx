import { useEffect, useState } from 'react'
import type { Product } from '@/services/product/product.types'
import type { CartItemModifier } from '@/services/cart/cart.types'
import { useCartStore } from '@/services/cart/cart.store'
import { Button } from '@/components/ui/button'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { fmtMoney } from '@/lib/format'

interface ModifierGroup {
  id: string
  name: string
  type: string
  modifiers: { id: string; name: string; priceAdjustment: number }[]
}

interface ModifierDialogProps {
  product: Product
  groups: ModifierGroup[]
  onClose: () => void
}

export function ModifierDialog({ product, groups, onClose }: ModifierDialogProps) {
  const addItem = useCartStore((s) => s.addItem)
  const [selected, setSelected] = useState<Record<string, string>>({})

  // Auto-select first option for single-select groups
  useEffect(() => {
    const initial: Record<string, string> = {}
    for (const g of groups) {
      if (g.type === 'single-select' && g.modifiers.length > 0) {
        initial[g.id] = g.modifiers[0].id
      }
    }
    setSelected(initial)
  }, [groups])

  const handleToggle = (groupId: string, modifierId: string, type: string) => {
    if (type === 'single-select') {
      setSelected(prev => ({ ...prev, [groupId]: modifierId }))
    } else {
      setSelected(prev => {
        const current = prev[groupId] ? prev[groupId].split(',') : []
        if (current.includes(modifierId)) {
          return { ...prev, [groupId]: current.filter(id => id !== modifierId).join(',') }
        }
        return { ...prev, [groupId]: [...current, modifierId].join(',') }
      })
    }
  }

  const handleAdd = () => {
    const modifiers: CartItemModifier[] = []
    for (const g of groups) {
      const sel = selected[g.id]
      if (!sel) continue
      const ids = sel.split(',')
      for (const modId of ids) {
        const mod = g.modifiers.find(m => m.id === modId)
        if (mod) {
          modifiers.push({
            groupId: g.id,
            groupName: g.name,
            modifierId: mod.id,
            modifierName: mod.name,
            priceAdjustment: mod.priceAdjustment,
          })
        }
      }
    }
    addItem(product, modifiers)
    onClose()
  }

  const totalPrice = product.price + groups.reduce((sum, g) => {
    const sel = selected[g.id]
    if (!sel) return sum
    return sum + sel.split(',').reduce((s, modId) => {
      const mod = g.modifiers.find(m => m.id === modId)
      return s + (mod?.priceAdjustment || 0)
    }, 0)
  }, 0)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-card border-2 rounded-3xl shadow-2xl w-[480px] max-w-[92vw] max-h-[85vh] flex flex-col overflow-hidden" dir="rtl" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-5 pb-3">
          <div className="flex items-center gap-3">
            <span className="text-3xl">{product.emoji}</span>
            <div>
              <h3 className="font-black text-base">{product.name}</h3>
              <p className="text-xs text-muted-foreground">{product.description}</p>
            </div>
          </div>
          <Button variant="ghost" size="icon" className="h-11 w-11 rounded-xl shrink-0" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Modifier groups */}
        <div className="flex-1 overflow-y-auto px-5 space-y-4 pb-4">
          {groups.filter(g => g.modifiers.length > 0).map(group => (
            <div key={group.id} className="space-y-2">
              <div className="flex items-center gap-2">
                <h4 className="text-sm font-bold">{group.name}</h4>
                <span className="text-xs text-muted-foreground bg-secondary rounded-full px-2.5 py-1">
                  {group.type === 'single-select' ? 'اختار واحد' : 'اختار أكثر من واحد'}
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {group.modifiers.map(mod => {
                  const sel = selected[group.id] || ''
                  const isSelected = sel.split(',').includes(mod.id)
                  return (
                    <button
                      key={mod.id}
                      onClick={() => handleToggle(group.id, mod.id, group.type)}
                      className={cn(
                        "aspect-square flex flex-col items-center justify-center gap-1 rounded-2xl border-2 transition-all cursor-pointer p-2",
                        isSelected
                          ? "bg-primary/10 border-primary shadow-md shadow-primary/10"
                          : "bg-card border-border/60 hover:border-border"
                      )}
                    >
                      <span className="text-sm font-black text-center leading-tight">{mod.name}</span>
                      <span className="text-sm font-black text-primary">
                        {fmtMoney(product.price + mod.priceAdjustment)} ج.م
                      </span>
                      {isSelected && (
                        <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-[10px] font-black flex items-center justify-center">✓</span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="p-5 pt-3 border-t">
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-bold">السعر</span>
            <div className="flex items-baseline gap-1">
              <span className="font-black text-xl text-primary">{fmtMoney(totalPrice)}</span>
              <span className="text-xs text-muted-foreground">ج.م</span>
            </div>
          </div>
          <Button className="w-full rounded-2xl h-12 text-base font-black" onClick={handleAdd}>
            إضافة للسلة
          </Button>
        </div>
      </div>
    </div>
  )
}
