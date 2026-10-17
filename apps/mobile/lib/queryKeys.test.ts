import { describe, expect, it } from 'vitest';
import { qk, qkPrefix } from './queryKeys';

describe('query keys', () => {
  it('names a plain resource with a single element', () => {
    expect(qk.menu).toEqual(['menu']);
    expect(qk.settings).toEqual(['settings']);
    expect(qk.ingredients).toEqual(['ingredients']);
  });

  it('carries an id inside its resource prefix', () => {
    expect(qk.order('o-1')).toEqual(['orders', 'o-1']);
    expect(qk.productOptions('p-1')).toEqual(['menu', 'products', 'p-1', 'options']);
    expect(qk.cashDrawer('s-1')).toEqual(['cash-drawer', 's-1']);
  });

  it('keys a filtered list distinctly from the unfiltered one', () => {
    expect(qk.orders()).toEqual(['orders', {}]);
    expect(qk.orders({ status: 'COMPLETED' })).toEqual(['orders', { status: 'COMPLETED' }]);
  });

  it('keeps every list under the prefix a mutation invalidates', () => {
    // `invalidateQueries({ queryKey: ['orders'] })` must reach both.
    expect(qk.orders()[0]).toBe('orders');
    expect(qk.order('o-1')[0]).toBe('orders');
  });

  it('keeps recipes under the products prefix', () => {
    expect(qk.productRecipes('p-1')[0]).toBe('products');
  });

  it('exposes the same prefixes mutations invalidate', () => {
    expect(qkPrefix.orders()).toEqual(['orders']);
    expect(qkPrefix.menu()).toEqual(['menu']);
    expect(qkPrefix.reports()).toEqual(['reports']);
  });
});
