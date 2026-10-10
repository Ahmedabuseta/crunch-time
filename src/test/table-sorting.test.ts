import { describe, it, expect } from 'vitest'
import {
  compareSortValues,
  sortRows,
  nextSortDir,
  toggleSort,
  type SortState,
} from '../components/ui/data-table'

type Row = { id: number; name?: string | null; amount?: number | null; active?: boolean }

describe('compareSortValues', () => {
  it('orders numbers numerically, not lexicographically', () => {
    expect(compareSortValues(3, 10)).toBeLessThan(0)
    expect(compareSortValues(10, 3)).toBeGreaterThan(0)
    expect(compareSortValues(7, 7)).toBe(0)
  })

  it('coerces mixed number/string comparisons numerically', () => {
    expect(compareSortValues(5, '10')).toBeLessThan(0)
  })

  it('orders Arabic text by locale', () => {
    expect(compareSortValues('برجر', 'شيش')).toBeLessThan(0)
    expect(compareSortValues('شيش', 'برجر')).toBeGreaterThan(0)
  })

  it('ignores case and Arabic diacritic-level differences', () => {
    expect(compareSortValues('APPLE', 'apple')).toBe(0)
  })

  it('compares numeric strings by value', () => {
    expect(compareSortValues('منتج 2', 'منتج 10')).toBeLessThan(0)
  })

  it('orders booleans false before true', () => {
    expect(compareSortValues(false, true)).toBeLessThan(0)
    expect(compareSortValues(true, false)).toBeGreaterThan(0)
  })

  it('treats null, undefined and empty string as empty', () => {
    expect(compareSortValues(null, 5)).toBeGreaterThan(0)
    expect(compareSortValues(undefined, 5)).toBeGreaterThan(0)
    expect(compareSortValues('', 'أ')).toBeGreaterThan(0)
    expect(compareSortValues(5, null)).toBeLessThan(0)
    expect(compareSortValues(null, '')).toBe(0)
  })
})

describe('sortRows', () => {
  const rows: Row[] = [
    { id: 1, name: 'كرنشي', amount: 120 },
    { id: 2, name: 'زنجر', amount: null },
    { id: 3, name: 'بانيه', amount: 40 },
    { id: 4, name: null, amount: 200 },
  ]

  const byAmount = (r: Row) => r.amount
  const byName = (r: Row) => r.name

  it('returns rows untouched when sort is null', () => {
    expect(sortRows(rows, null)).toBe(rows)
  })

  it('sorts ascending and descending by number', () => {
    expect(sortRows(rows, { key: 'amount', dir: 'asc', value: byAmount }).map(r => r.id)).toEqual([3, 1, 4, 2])
    expect(sortRows(rows, { key: 'amount', dir: 'desc', value: byAmount }).map(r => r.id)).toEqual([4, 1, 3, 2])
  })

  it('keeps empty values at the end in both directions', () => {
    expect(sortRows(rows, { key: 'amount', dir: 'asc', value: byAmount }).map(r => r.id).pop()).toBe(2)
    expect(sortRows(rows, { key: 'amount', dir: 'desc', value: byAmount }).map(r => r.id).pop()).toBe(2)
    expect(sortRows(rows, { key: 'name', dir: 'asc', value: byName }).map(r => r.id).pop()).toBe(4)
    expect(sortRows(rows, { key: 'name', dir: 'desc', value: byName }).map(r => r.id).pop()).toBe(4)
  })

  it('does not mutate the input array', () => {
    const input = [{ v: 3 }, { v: 1 }, { v: 2 }]
    sortRows(input, { key: 'v', dir: 'asc', value: (r) => r.v })
    expect(input.map(r => r.v)).toEqual([3, 1, 2])
  })

  it('is stable for equal values', () => {
    const equal = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
    expect(sortRows(equal, { key: 'x', dir: 'asc', value: () => 1 }).map(r => r.id)).toEqual(['a', 'b', 'c'])
    expect(sortRows(equal, { key: 'x', dir: 'desc', value: () => 1 }).map(r => r.id)).toEqual(['a', 'b', 'c'])
  })
})

describe('header click cycle', () => {
  const value = (r: { v: number }) => r.v

  it('cycles unsorted → asc → desc → unsorted', () => {
    expect(nextSortDir(null, 'v')).toBe('asc')
    expect(nextSortDir({ key: 'v', dir: 'asc' }, 'v')).toBe('desc')
    expect(nextSortDir({ key: 'v', dir: 'desc' }, 'v')).toBe(null)
  })

  it('starts at asc when clicking a different column', () => {
    expect(nextSortDir({ key: 'other', dir: 'desc' }, 'v')).toBe('asc')
  })

  it('toggleSort builds the state and clears it on the third click', () => {
    const asc = toggleSort(null, 'v', value)
    expect(asc).toEqual({ key: 'v', dir: 'asc', value })
    const desc = toggleSort(asc, 'v', value)
    expect(desc?.dir).toBe('desc')
    expect(toggleSort(desc, 'v', value)).toBe(null)
  })

  it('toggleSort result drives sortRows end to end', () => {
    const data = [{ v: 5 }, { v: 1 }, { v: 3 }]
    let sort: SortState<{ v: number }> | null = null
    sort = toggleSort(sort, 'v', value)
    expect(sortRows(data, sort).map(r => r.v)).toEqual([1, 3, 5])
    sort = toggleSort(sort, 'v', value)
    expect(sortRows(data, sort).map(r => r.v)).toEqual([5, 3, 1])
    sort = toggleSort(sort, 'v', value)
    expect(sort).toBe(null)
  })
})
