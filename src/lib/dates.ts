// Date helpers shared by the report and list screens.
//
// Local time on purpose: "this month" means the owner's own calendar month, and
// these `YYYY-MM-DD` strings are compared against `created_at` by the server.

const pad = (n: number) => String(n).padStart(2, '0')

export const fmtLocal = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

export const today = () => fmtLocal(new Date())

export const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return fmtLocal(d)
}

/** The 1st of the current month — "من بداية الشهر". */
export const monthStart = () =>
  fmtLocal(new Date(new Date().getFullYear(), new Date().getMonth(), 1))

/** Most recent Saturday (Saturday-first week). */
export const weekStart = () => {
  const d = new Date()
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return fmtLocal(d)
}
