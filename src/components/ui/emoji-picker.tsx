import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'

const EMOJI_CATEGORIES: { label: string; emojis: string[] }[] = [
  {
    label: 'طعام',
    emojis: ['🍔', '🍕', '🍟', '🌭', '🍿', '🥓', '🥚', '🧀', '🥩', '🍗', '🍖', '🥪', '🌮', '🌯', '🥙', '🧆', '🥗', '🥣', '🍝', '🍜', '🍲', '🍛', '🍣', '🍱', '🥟', '🍤', '🍙', '🍚', '🍘', '🍥', '🥠', '🍢', '🍡', '🍧', '🍨', '🍦', '🥧', '🧁', '🍰', '🎂', '🍮', '🍭', '🍬', '🍫', '🍩', '🍪', '🌰', '🥜', '🍯'],
  },
  {
    label: 'مشروبات',
    emojis: ['🥤', '🧃', '🥛', '☕', '🍵', '🧋', '🍶', '🍺', '🍻', '🥂', '🍷', '🍸', '🍹', '🧉', '🫖'],
  },
  {
    label: 'فواكه وخضار',
    emojis: ['🍎', '🍐', '🍊', '🍋', '🍌', '🍉', '🍇', '🍓', '🫐', '🍈', '🍒', '🍑', '🥭', '🍍', '🥥', '🥝', '🍅', '🍆', '🥑', '🫛', '🥦', '🥬', '🥒', '🌶️', '🫑', '🌽', '🥕', '🧅', '🧄', '🥔', '🍠', '🫘', '🥜', '🫒', '🍄'],
  },
  {
    label: 'حيوانات',
    emojis: ['🐶', '🐱', '🐭', '🐹', '🐰', '🦊', '🐻', '🐼', '🐻‍❄️', '🐨', '🐯', '🦁', '🐮', '🐷', '🐸', '🐵', '🐔', '🐧', '🐦', '🐤', '🦆', '🦅', '🦉', '🦇', '🐺', '🐗', '🐴', '🦄', '🐝', '🐛', '🦋', '🐌', '🐞', '🐜'],
  },
  {
    label: 'وجوه',
    emojis: ['😀', '😃', '😄', '😁', '😆', '😅', '🤣', '😂', '🙂', '🙃', '😉', '😊', '😇', '🥰', '😍', '🤩', '😘', '😗', '😚', '😙', '🥲', '😋', '😛', '😜', '🤪', '😝', '🤑', '🤗', '🤭', '🤫', '🤔', '🫡', '🤐', '🤨', '😐', '😑', '😶', '🫥', '😏', '😒', '🙄', '😬', '😮‍💨', '🤥', '😌', '😔', '😪', '🤤', '😴', '😷', '🤒', '🤕', '🤢', '🤮', '🥵', '🥶', '🥴', '😵', '🤯', '🤠', '🥳', '🥸', '😎', '🤓', '🧐'],
  },
  {
    label: 'أيدي وإيماءات',
    emojis: ['👍', '👎', '👌', '🤌', '✌️', '🤞', '🫰', '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇', '☝️', '🫵', '👋', '🤚', '🖐️', '✋', '🖖', '🫱', '🫲', '👏', '🙌', '🫶', '👐', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🫂'],
  },
  {
    label: 'رموز',
    emojis: ['❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔', '❤️‍🔥', '💯', '💢', '💥', '💫', '💦', '💨', '🔥', '⭐', '🌟', '✨', '⚡', '☀️', '🌈', '🎉', '🎊', '🎈', '🎁', '🏆', '🥇', '🥈', '🥉', '🏅', '⚽', '🏀', '🏈', '⚾'],
  },
]

interface EmojiPickerProps {
  value: string
  onChange: (emoji: string) => void
  className?: string
}

export function EmojiPicker({ value, onChange, className }: EmojiPickerProps) {
  const [open, setOpen] = useState(false)
  const [activeCategory, setActiveCategory] = useState(0)
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const portalRef = useRef<HTMLDivElement>(null)

  // Portal the grid like the other popovers: inside a modal/scroll area an
  // absolutely-positioned picker gets clipped by the container.
  useEffect(() => {
    if (!open) { setPos(null); return }
    const update = () => {
      const r = ref.current?.getBoundingClientRect()
      if (!r) return
      const width = 320
      const below = window.innerHeight - r.bottom - 10
      const above = r.top - 10
      const up = below < 300 && above >= 8
      const left = Math.min(Math.max(8, r.right - width), window.innerWidth - width - 8)
      setPos({ top: up ? r.top - 6 : r.bottom + 6, left, up })
    }
    update()
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)
    return () => {
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
    }
  }, [open])

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      const target = e.target as Node
      if (ref.current?.contains(target) || portalRef.current?.contains(target)) return
      setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', handle)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', handle)
      document.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full px-3 py-2 rounded-xl bg-secondary text-sm border-0 focus:ring-1 focus:ring-primary focus:outline-none text-center cursor-pointer hover:bg-secondary/80 transition-colors"
      >
        {value || 'اختر ايموجي'}
      </button>

      {open && pos && createPortal(
        <div
          ref={portalRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 140 }}
          className={cn("w-[320px] bg-card border-2 rounded-2xl shadow-xl overflow-hidden", pos.up ? "-translate-y-full" : "animate-slide-up")}
        >
          {/* Category tabs */}
          <div className="flex overflow-x-auto border-b px-2 pt-2 gap-1">
            {EMOJI_CATEGORIES.map((cat, i) => (
              <button
                key={cat.label}
                onClick={() => setActiveCategory(i)}
                className={cn(
                  "shrink-0 px-3 py-1.5 rounded-t-lg text-[10px] font-bold transition-all cursor-pointer",
                  activeCategory === i
                    ? "bg-secondary text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Emoji grid */}
          <div className="p-3 grid grid-cols-8 gap-1 max-h-[200px] overflow-y-auto">
            {EMOJI_CATEGORIES[activeCategory].emojis.map((emoji) => (
              <button
                key={emoji}
                onClick={() => { onChange(emoji); setOpen(false) }}
                className={cn(
                  "w-9 h-9 flex items-center justify-center rounded-lg text-xl emoji hover:bg-secondary transition-all cursor-pointer",
                  value === emoji && "bg-primary/20 ring-1 ring-primary"
                )}
              >
                {emoji}
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
