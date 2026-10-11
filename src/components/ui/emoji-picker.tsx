import { useState, useRef, useEffect } from 'react'
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
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handle = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handle)
    return () => document.removeEventListener('mousedown', handle)
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

      {open && (
        <div className="absolute z-50 top-full mt-2 right-0 w-[320px] bg-card border-2 rounded-2xl shadow-xl overflow-hidden animate-slide-up">
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
        </div>
      )}
    </div>
  )
}
