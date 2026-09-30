import * as React from "react"
import { cn } from "@/lib/utils"

interface TabsContextValue {
  value: string | null
  onValueChange: (value: string) => void
}

const TabsContext = React.createContext<TabsContextValue>({ value: null, onValueChange: () => {} })

interface TabsProps {
  value?: string | null
  defaultValue?: string
  onValueChange?: (value: string) => void
  className?: string
  children?: React.ReactNode
}

function Tabs({ value, defaultValue, onValueChange, className, children }: TabsProps) {
  const [inner, setInner] = React.useState<string | null>(defaultValue ?? null)
  const isControlled = value !== undefined
  const current = isControlled ? value : inner

  const change = React.useCallback((next: string) => {
    if (!isControlled) setInner(next)
    onValueChange?.(next)
  }, [isControlled, onValueChange])

  const ctx = React.useMemo(() => ({ value: current, onValueChange: change }), [current, change])
  return (
    <TabsContext.Provider value={ctx}>
      <div className={cn("flex flex-col gap-2", className)}>{children}</div>
    </TabsContext.Provider>
  )
}

function TabsList({ className, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex h-9 items-center justify-center rounded-lg bg-secondary p-1 text-muted-foreground",
        "w-full sm:w-auto",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

function TabsTrigger({ value, className, children, ...props }: TabsTriggerProps) {
  const ctx = React.useContext(TabsContext)
  const active = ctx.value === value
  return (
    <button
      type="button"
      onClick={() => ctx.onValueChange(value)}
      className={cn(
        "inline-flex flex-1 sm:flex-none items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1 text-xs font-bold transition-all cursor-pointer",
        active
          ? "bg-background text-foreground shadow"
          : "text-muted-foreground hover:text-foreground",
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

function TabsContent({ value, className, children, ...props }: TabsContentProps) {
  const ctx = React.useContext(TabsContext)
  if (ctx.value !== value) return null
  return (
    <div className={cn("mt-1", className)} {...props}>
      {children}
    </div>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }