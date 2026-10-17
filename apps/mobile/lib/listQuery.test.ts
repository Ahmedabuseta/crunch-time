import { describe, expect, it } from 'vitest';
import { initialQuery, rangeLabel, toParams, withSort } from './listQuery';

const base = () => initialQuery('name', 'asc');

describe('toParams', () => {
  it('sends the sort, direction, page and size', () => {
    expect(toParams(base(), 1, 25)).toEqual({
      sort: 'name',
      dir: 'asc',
      page: 1,
      pageSize: 25,
      search: undefined,
    });
  });

  it('drops an empty search rather than sending a blank one', () => {
    expect(toParams({ ...base(), search: '   ' }, 1, 10).search).toBeUndefined();
  });

  it('trims a real search', () => {
    expect(toParams({ ...base(), search: ' كريب ' }, 1, 10).search).toBe('كريب');
  });

  it('flattens filters into the query string, skipping cleared ones', () => {
    const params = toParams(
      { ...base(), filters: { categoryId: 'c1', low: undefined, role: '' } },
      1,
      10
    );
    expect(params.categoryId).toBe('c1');
    expect(params).not.toHaveProperty('low');
    expect(params).not.toHaveProperty('role');
  });

  it('carries the page React Query asked for', () => {
    expect(toParams(base(), 4, 25).page).toBe(4);
  });
});

describe('withSort', () => {
  it('starts a new column ascending', () => {
    expect(withSort(base(), 'price').dir).toBe('asc');
  });

  it('takes an explicit direction', () => {
    expect(withSort(base(), 'price', 'desc').dir).toBe('desc');
  });

  it('flips when the same column is chosen again', () => {
    const flipped = withSort(base(), 'name');
    expect(flipped.dir).toBe('desc');
    expect(withSort(flipped, 'name').dir).toBe('asc');
  });

  it('keeps the search and filters it was given', () => {
    const query = { ...base(), search: 'كريب', filters: { categoryId: 'c1' } };
    expect(withSort(query, 'price')).toMatchObject({
      search: 'كريب',
      filters: { categoryId: 'c1' },
      sort: 'price',
    });
  });
});

describe('rangeLabel', () => {
  it('says how much of the list is loaded', () => {
    expect(rangeLabel(25, 412)).toBe('25 من 412');
    expect(rangeLabel(412, 412)).toBe('412 من 412');
  });

  it('never claims more than exists', () => {
    expect(rangeLabel(30, 12)).toBe('12 من 12');
  });

  it('says so when there is nothing', () => {
    expect(rangeLabel(0, 0)).toBe('مفيش نتائج');
  });
});
