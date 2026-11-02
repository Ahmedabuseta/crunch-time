import { describe, it, expect } from 'vitest'
import { describeSchedule, isScheduleActive, parseDaysOfWeek, serializeDaysOfWeek } from '../lib/discount-schedule'

// Local-time constructors (no trailing Z) so the assertions are timezone-safe.
const at = (iso: string) => new Date(iso)

describe('discount schedule', () => {
  it('is always active without limits', () => {
    expect(isScheduleActive({}, at('2026-11-02T12:00:00')).active).toBe(true)
  })

  it('treats start and end dates as inclusive', () => {
    const schedule = { startsAt: '2026-11-01', endsAt: '2026-11-30' }
    expect(isScheduleActive(schedule, at('2026-11-01T00:01:00'))).toEqual({ active: true })
    expect(isScheduleActive(schedule, at('2026-11-30T23:59:00'))).toEqual({ active: true })
    expect(isScheduleActive(schedule, at('2026-10-31T23:59:00')).reason).toBe('الخصم لم يبدأ بعد')
    expect(isScheduleActive(schedule, at('2026-12-01T00:00:00')).reason).toBe('انتهت صلاحية الخصم')
  })

  it('filters by weekday, treating seven selected days as every day', () => {
    // 2026-11-02 is a Monday (getDay() === 1).
    expect(isScheduleActive({ daysOfWeek: [1] }, at('2026-11-02T12:00:00')).active).toBe(true)
    expect(isScheduleActive({ daysOfWeek: [1] }, at('2026-11-03T12:00:00')).active).toBe(false)
    expect(isScheduleActive({ daysOfWeek: '0,1,2,3,4,5,6' }, at('2026-11-03T12:00:00')).active).toBe(true)
  })

  it('filters by time window', () => {
    const schedule = { startTime: '15:00', endTime: '18:00' }
    expect(isScheduleActive(schedule, at('2026-11-02T14:59:00')).active).toBe(false)
    expect(isScheduleActive(schedule, at('2026-11-02T15:00:00')).active).toBe(true)
    expect(isScheduleActive(schedule, at('2026-11-02T17:59:00')).active).toBe(true)
    expect(isScheduleActive(schedule, at('2026-11-02T18:00:00')).active).toBe(false)
  })

  it('supports a window that crosses midnight', () => {
    const schedule = { startTime: '22:00', endTime: '02:00' }
    expect(isScheduleActive(schedule, at('2026-11-02T23:00:00')).active).toBe(true)
    expect(isScheduleActive(schedule, at('2026-11-03T01:00:00')).active).toBe(true)
    expect(isScheduleActive(schedule, at('2026-11-03T12:00:00')).active).toBe(false)
  })

  it('parses and serializes the weekday CSV', () => {
    expect(parseDaysOfWeek('1,2,2,9')).toEqual([1, 2])
    expect(parseDaysOfWeek(null)).toEqual([])
    expect(serializeDaysOfWeek([])).toBeNull()
    expect(serializeDaysOfWeek([5, 1, 5])).toBe('1,5')
  })

  it('describes the window for the admin list and the cart banner', () => {
    expect(describeSchedule({})).toBe('')
    expect(
      describeSchedule({ startsAt: '2026-11-01', endsAt: '2026-11-30', daysOfWeek: '5,6', startTime: '15:00', endTime: '18:00' }),
    ).toBe('1 نوفمبر – 30 نوفمبر · الجمعة، السبت · 15:00–18:00')
  })
})
