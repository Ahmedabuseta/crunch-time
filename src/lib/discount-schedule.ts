export interface DiscountSchedule {
  startsAt?: string | null
  endsAt?: string | null
  daysOfWeek?: number[] | string | null
  startTime?: string | null
  endTime?: string | null
}

export interface ScheduleStatus {
  active: boolean
  reason?: string
}

const WEEKDAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
const MONTHS = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']

const pad = (n: number) => String(n).padStart(2, '0')

export const localDateString = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const localTimeString = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`

const isDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

const isTime = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{2}:\d{2}$/.test(value)

export function parseDaysOfWeek(value: number[] | string | null | undefined): number[] {
  if (!value) return []
  const raw = Array.isArray(value) ? value : String(value).split(',')
  const days = raw
    .map((d) => Number(d))
    .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  return [...new Set(days)].sort((a, b) => a - b)
}

export function serializeDaysOfWeek(value: number[] | string | null | undefined): string | null {
  const days = parseDaysOfWeek(value)
  return days.length ? days.join(',') : null
}

export function isScheduleActive(schedule: DiscountSchedule, now: Date = new Date()): ScheduleStatus {
  const today = localDateString(now)

  if (isDate(schedule.startsAt) && today < schedule.startsAt) {
    return { active: false, reason: 'الخصم لم يبدأ بعد' }
  }
  if (isDate(schedule.endsAt) && today > schedule.endsAt) {
    return { active: false, reason: 'انتهت صلاحية الخصم' }
  }

  const days = parseDaysOfWeek(schedule.daysOfWeek)
  if (days.length > 0 && days.length < 7 && !days.includes(now.getDay())) {
    return { active: false, reason: 'الخصم غير متاح في هذا اليوم' }
  }

  const current = localTimeString(now)
  const start = isTime(schedule.startTime) ? schedule.startTime : null
  const end = isTime(schedule.endTime) ? schedule.endTime : null

  if (start && end) {
    const inWindow = start <= end
      ? current >= start && current < end
      : current >= start || current < end
    if (!inWindow) return { active: false, reason: 'الخصم غير متاح في هذا الوقت' }
  } else if (start && current < start) {
    return { active: false, reason: 'الخصم غير متاح في هذا الوقت' }
  } else if (end && current >= end) {
    return { active: false, reason: 'الخصم غير متاح في هذا الوقت' }
  }

  return { active: true }
}

function formatDate(value: string): string {
  if (!isDate(value)) return value
  const [, month, day] = value.split('-').map(Number)
  return `${day} ${MONTHS[month - 1] ?? ''}`.trim()
}

export function describeSchedule(schedule: DiscountSchedule): string {
  const parts: string[] = []

  const starts = isDate(schedule.startsAt) ? schedule.startsAt : null
  const ends = isDate(schedule.endsAt) ? schedule.endsAt : null
  if (starts && ends) parts.push(`${formatDate(starts)} – ${formatDate(ends)}`)
  else if (starts) parts.push(`من ${formatDate(starts)}`)
  else if (ends) parts.push(`حتى ${formatDate(ends)}`)

  const days = parseDaysOfWeek(schedule.daysOfWeek)
  if (days.length > 0 && days.length < 7) parts.push(days.map((d) => WEEKDAYS[d]).join('، '))

  const start = isTime(schedule.startTime) ? schedule.startTime : null
  const end = isTime(schedule.endTime) ? schedule.endTime : null
  if (start && end) parts.push(`${start}–${end}`)
  else if (start) parts.push(`من ${start}`)
  else if (end) parts.push(`حتى ${end}`)

  return parts.join(' · ')
}
