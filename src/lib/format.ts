/** Round a money value to at most two decimals (half away from zero). */
export function roundMoney(n: number): number {
  const value = Number(n)
  if (!Number.isFinite(value)) return 0
  const rounded = Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100
  if (rounded === 0) return 0
  return value < 0 ? -rounded : rounded
}

export function fmtMoney(n: number): string {
  return roundMoney(n).toLocaleString('en-US', { maximumFractionDigits: 2 })
}
