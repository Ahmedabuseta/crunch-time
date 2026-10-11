import type { ReactNode } from 'react'

import { cn } from '@/lib/utils'

/**
 * Renders an emoji on its own element.
 *
 * Emoji in this app sit inside `font-bold` / `font-black` labels (category
 * tabs, cart lines, report rows). Tajawal has no emoji glyphs, so the fallback
 * emoji font has to absorb that weight — and on Windows DirectWrite emulates
 * bold by stroking the glyph, which paints emoji with a thick black outline.
 * Pinning the weight to 400 on the emoji only (never on the Arabic next to
 * it) keeps the glyph clean.
 */
export function Emoji({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={cn('emoji', className)}>{children}</span>
}
