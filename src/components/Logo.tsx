import { cn } from '@/lib/utils'
import logoUrl from '@/assets/logo.png'

interface LogoProps {
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

// The round Crunch Time badge (src/assets/logo.png, generated from
// build/logo-master.png by `npm run icons`). Heights are chosen to match the
// type scale this replaced — sm sits in the top bar next to the nav pills,
// lg is the hero mark on the login card.
const sizeClasses = {
  sm: 'h-8',
  md: 'h-12',
  lg: 'h-28',
}

export function Logo({ className, size = 'md' }: LogoProps) {
  return (
    <img
      src={logoUrl}
      alt="Crunch Time"
      width={256}
      height={256}
      aria-label="Crunch Time"
      draggable={false}
      className={cn('w-auto select-none shrink-0', sizeClasses[size], className)}
    />
  )
}
