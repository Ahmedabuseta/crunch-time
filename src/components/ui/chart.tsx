import type { ReactElement, ReactNode } from "react"
import { ResponsiveContainer } from "recharts"
import { cn } from "@/lib/utils"

export type ChartKind = "currency" | "number" | "multiplier" | "percent" | "ratio"

const fmtByKind: Record<ChartKind, (v: number) => string> = {
  currency: (v) => `${Math.round(v).toLocaleString("ar-EG")} ج.م`,
  number: (v) => Math.round(v).toLocaleString("ar-EG"),
  multiplier: (v) => `${v.toFixed(2)}×`,
  percent: (v) => `${v.toFixed(1)}%`,
  ratio: (v) => v.toFixed(2),
}

interface ChartContainerProps {
  className?: string
  children: ReactNode
}

export function ChartContainer({ className, children }: ChartContainerProps) {
  return (
    <div className={cn("w-full", className)} dir="ltr">
      <ResponsiveContainer width="100%" height="100%">
        {children as ReactElement}
      </ResponsiveContainer>
    </div>
  )
}

interface ChartTooltipProps {
  active?: boolean
  label?: string | number
  payload?: { name?: string; value?: number | string; color?: string }[]
  kind?: ChartKind
  labelFormatter?: (label: string | number | undefined) => string
  nameFormatter?: (name: string | undefined) => string
}

export function chartColor(variable: string, fallback: string) {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(variable).trim() || fallback
}

export function ChartTooltip({ active, payload, label, kind = "currency", labelFormatter, nameFormatter }: ChartTooltipProps) {
  if (!active || !payload?.length) return null
  const fmt = fmtByKind[kind]
  return (
    <div className="rounded-lg border bg-background/95 backdrop-blur px-3 py-2 shadow-lg text-[11px] space-y-1 min-w-[120px]">
      {label != null && (
        <p className="font-black text-muted-foreground" dir="rtl">
          {labelFormatter ? labelFormatter(label) : label}
        </p>
      )}
      <div className="space-y-0.5" dir="rtl">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-1.5 text-muted-foreground font-bold">
              <span className="inline-block h-2 w-2 rounded-full" style={{ background: entry.color }} />
              {nameFormatter ? nameFormatter(entry.name) : entry.name}
            </span>
            <span className="font-black">
              {typeof entry.value === "number" ? fmt(entry.value) : String(entry.value ?? "—")}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}