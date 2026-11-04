import { useEffect, useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { SearchInput } from '@/components/ui/search-input'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Emoji } from '@/components/Emoji'
import { toast } from '@/components/ui/toast'
import { EyeOff, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

interface LinkProduct {
  id: string
  name: string
  emoji: string
  active: boolean
}

interface ProductLinkDialogProps {
  open: boolean
  title: string
  description?: string
  productIds: string[]
  onSave: (ids: string[]) => Promise<void>
  onClose: () => void
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'تعذر حفظ الربط'
}

/**
 * Shared reverse-link picker: addons and modifier groups both need to choose
 * the products that offer them, with hidden products still selectable.
 */
export function ProductLinkDialog({
  open,
  title,
  description,
  productIds,
  onSave,
  onClose,
}: ProductLinkDialogProps) {
  const [products, setProducts] = useState<LinkProduct[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setSelected(new Set(productIds))
    setSearch('')
    setLoading(true)
    void window.api.product.list(undefined, true)
      .then((rows: any) => setProducts(rows as LinkProduct[]))
      .catch((error) => toast({ title: messageOf(error), variant: 'error' }))
      .finally(() => setLoading(false))
    // Opening the dialog is the only moment the selection is seeded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    if (!needle) return products
    return products.filter((product) => product.name.toLowerCase().includes(needle))
  }, [products, search])

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const save = async () => {
    if (saving) return
    setSaving(true)
    try {
      await onSave([...selected])
      onClose()
    } catch (error) {
      toast({ title: messageOf(error), variant: 'error' })
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm animate-fade-in" />
      <div
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-3xl border-2 border-border bg-card shadow-2xl animate-scale-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b px-5 py-4">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-black">{title}</h3>
            {description && <p className="mt-0.5 text-[10px] text-muted-foreground">{description}</p>}
          </div>
          <Button variant="ghost" size="icon" className="rounded-xl" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="shrink-0 space-y-2 border-b px-5 py-3">
          <SearchInput value={search} onChange={setSearch} placeholder="بحث عن منتج..." />
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <span>
              المحدد: <strong className="text-foreground">{selected.size}</strong>
            </span>
            <button
              type="button"
              className="ms-auto cursor-pointer rounded-md px-2 py-1 font-bold hover:bg-secondary"
              onClick={() => setSelected(new Set(visible.map((product) => product.id)))}
            >
              تحديد الظاهر
            </button>
            <button
              type="button"
              className="cursor-pointer rounded-md px-2 py-1 font-bold hover:bg-secondary"
              onClick={() => setSelected(new Set())}
            >
              مسح
            </button>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1 p-2">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> بتحميل المنتجات…
            </div>
          ) : visible.length === 0 ? (
            <p className="py-10 text-center text-xs text-muted-foreground">مفيش منتج مطابق</p>
          ) : (
            visible.map((product) => (
              <label
                key={product.id}
                className={cn(
                  'flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 transition-colors hover:bg-secondary/60',
                  !product.active && 'opacity-60',
                )}
              >
                <input
                  type="checkbox"
                  checked={selected.has(product.id)}
                  onChange={() => toggle(product.id)}
                  className="h-4 w-4 accent-primary"
                />
                <Emoji className="text-lg">{product.emoji}</Emoji>
                <span className="min-w-0 flex-1 truncate text-sm font-bold">{product.name}</span>
                {!product.active && (
                  <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[10px] text-muted-foreground">
                    <EyeOff className="h-3 w-3" /> مخفي
                  </span>
                )}
              </label>
            ))
          )}
        </ScrollArea>

        <div className="flex shrink-0 gap-2 border-t p-4">
          <Button className="flex-1 rounded-xl" disabled={saving || loading} onClick={() => void save()}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            حفظ الربط
          </Button>
          <Button variant="ghost" className="rounded-xl" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </div>
    </div>
  )
}
