import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, CheckSquare, FileDown, Square, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { SearchInput } from '@/components/ui/search-input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from '@/components/ui/toast'
import { Emoji } from '@/components/Emoji'
import { fmtMoney } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { Product } from '@/services/product/product.types'
import type { Category } from '@/services/category/category.types'

interface MenuExportDialogProps {
  open: boolean
  onClose: () => void
  products: Product[]
  categories: Category[]
}

const ALL = '__all__'

export function MenuExportDialog({ open, onClose, products, categories }: MenuExportDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState<string>(ALL)
  const [includeRecipes, setIncludeRecipes] = useState(true)
  const [includeCosts, setIncludeCosts] = useState(false)
  const [includeInactive, setIncludeInactive] = useState(false)
  const [busy, setBusy] = useState(false)

  const catMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories])

  useEffect(() => {
    if (!open) return
    setSelected(new Set(products.filter((p) => p.active).map((p) => p.id)))
    setSearch('')
    setCatFilter(ALL)
    setIncludeRecipes(true)
    setIncludeCosts(false)
    setIncludeInactive(false)
    setBusy(false)
  }, [open])

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase()
    return products.filter((p) => {
      if (!includeInactive && !p.active) return false
      if (catFilter !== ALL && p.categoryId !== catFilter) return false
      if (!term) return true
      return `${p.name} ${p.description} ${catMap.get(p.categoryId)?.name || ''}`
        .toLowerCase()
        .includes(term)
    })
  }, [products, includeInactive, catFilter, search, catMap])

  const groups = useMemo(
    () => categories
      .map((cat) => ({ cat, items: visible.filter((p) => p.categoryId === cat.id) }))
      .filter((g) => g.items.length > 0),
    [categories, visible],
  )

  const visibleIds = visible.map((p) => p.id)

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const selectVisible = () => setSelected((prev) => new Set([...prev, ...visibleIds]))
  const clearVisible = () => setSelected((prev) => {
    const next = new Set(prev)
    for (const id of visibleIds) next.delete(id)
    return next
  })

  const handleExport = async () => {
    if (selected.size === 0) return
    setBusy(true)
    try {
      const res = await window.api.menu.exportWord({
        productIds: [...selected],
        includeInactive,
        includeRecipes,
        includeCosts,
      })
      if (res.ok) {
        toast({ title: 'تم تصدير المنيو إلى Word', description: res.path, variant: 'success' })
        onClose()
      } else if (res.canceled) {
        toast({ title: 'تم إلغاء التصدير' })
        setBusy(false)
      } else {
        toast({ title: 'فشل التصدير', description: res.error, variant: 'error' })
        setBusy(false)
      }
    } catch (err: any) {
      toast({ title: 'فشل التصدير', description: err?.message, variant: 'error' })
      setBusy(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
      <div
        dir="rtl"
        className="relative w-full max-w-3xl max-h-[86vh] border-2 border-border rounded-3xl bg-card shadow-2xl flex flex-col animate-scale-in overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b">
          <div className="min-w-0">
            <h3 className="font-black text-base flex items-center gap-2">
              <FileDown className="h-4 w-4 text-primary" /> تصدير المنيو إلى Word
            </h3>
            <p className="text-[10px] text-muted-foreground mt-0.5">
              اختر المنتجات التي تظهر في المستند — {selected.size} من {products.length} محدد
            </p>
          </div>
          <Button variant="ghost" size="icon" className="rounded-xl shrink-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 py-3 border-b">
          <SearchInput value={search} onChange={setSearch} placeholder="بحث عن منتج…" className="flex-1 min-w-[180px]" />
          <Select value={catFilter} onValueChange={setCatFilter}>
            <SelectTrigger className="h-10 w-36 rounded-xl bg-secondary text-xs font-bold">
              <SelectValue placeholder="كل الأقسام" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>كل الأقسام</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.emoji} {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-10 rounded-xl gap-1 text-xs" onClick={selectVisible}>
              <CheckSquare className="h-3.5 w-3.5" /> تحديد الكل
            </Button>
            <Button variant="ghost" size="sm" className="h-10 rounded-xl gap-1 text-xs" onClick={clearVisible}>
              <Square className="h-3.5 w-3.5" /> إلغاء
            </Button>
          </div>
        </div>

        <div className="flex items-center gap-1.5 px-5 py-2.5 border-b overflow-x-auto">
          <OptionPill active={includeRecipes} onClick={() => setIncludeRecipes((v) => !v)}>
            مع الوصفات
          </OptionPill>
          <OptionPill active={includeCosts} onClick={() => setIncludeCosts((v) => !v)}>
            إظهار التكلفة
          </OptionPill>
          <OptionPill active={includeInactive} onClick={() => setIncludeInactive((v) => !v)}>
            إظهار المخفي
          </OptionPill>
        </div>

        <ScrollArea className="flex-1 min-h-0 px-5 py-3">
          {groups.length === 0 ? (
            <p className="py-12 text-center text-xs font-bold text-muted-foreground">لا توجد منتجات مطابقة</p>
          ) : (
            <div className="space-y-4 pb-2">
              {groups.map(({ cat, items }) => {
                const picked = items.filter((p) => selected.has(p.id)).length
                return (
                  <div key={cat.id} className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-black flex items-center gap-1.5">
                        <Emoji>{cat.emoji}</Emoji> {cat.name}
                      </p>
                      <span className="text-[10px] text-muted-foreground font-bold">{picked}/{items.length}</span>
                    </div>
                    <div className="space-y-1">
                      {items.map((p) => {
                        const on = selected.has(p.id)
                        return (
                          <button
                            key={p.id}
                            onClick={() => toggle(p.id)}
                            className={cn(
                              'w-full flex items-center gap-2.5 px-3 py-2 rounded-xl border text-right transition-colors cursor-pointer',
                              on ? 'border-primary/40 bg-primary/5' : 'border-transparent bg-secondary/40 hover:bg-secondary',
                              !p.active && 'opacity-60',
                            )}
                          >
                            <span className={cn(
                              'h-5 w-5 shrink-0 rounded-md border flex items-center justify-center',
                              on ? 'bg-primary border-primary text-primary-foreground' : 'border-border',
                            )}>
                              {on && <Check className="h-3.5 w-3.5" />}
                            </span>
                            <Emoji className="text-lg shrink-0">{p.emoji}</Emoji>
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-bold truncate">{p.name}</span>
                              {p.description && (
                                <span className="block text-[10px] text-muted-foreground truncate">{p.description}</span>
                              )}
                            </span>
                            {!p.active && (
                              <span className="shrink-0 rounded-full bg-secondary px-2 py-0.5 text-[9px] font-black text-muted-foreground">
                                مخفي
                              </span>
                            )}
                            <span className="shrink-0 text-xs font-black text-primary">{fmtMoney(p.price)} ج.م</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </ScrollArea>

        <div className="flex items-center gap-2 px-5 py-4 border-t">
          <p className="text-[11px] font-bold text-muted-foreground flex-1">
            سيتم تصدير {selected.size} منتج — {includeRecipes ? 'مع الوصفات' : 'بدون وصفات'}
            {includeCosts ? ' والتكاليف' : ''}
          </p>
          <Button variant="ghost" className="rounded-xl min-h-[44px] px-5" onClick={onClose}>إلغاء</Button>
          <Button
            className="rounded-xl min-h-[44px] gap-1.5 px-5 font-bold"
            disabled={selected.size === 0 || busy}
            onClick={handleExport}
          >
            <FileDown className="h-4 w-4" /> {busy ? 'جارٍ التصدير…' : 'تصدير Word'}
          </Button>
        </div>
      </div>
    </div>
  )
}

function OptionPill({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold border transition-colors cursor-pointer',
        active
          ? 'bg-primary text-primary-foreground border-primary'
          : 'bg-secondary text-muted-foreground border-transparent hover:border-border',
      )}
    >
      {children}
    </button>
  )
}
