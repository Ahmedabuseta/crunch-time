export function fmtMoney(n: number): string {
  const v = Math.round((n + Number.EPSILON) * 100) / 100
  return v.toLocaleString('en-US', { maximumFractionDigits: 2 })
}