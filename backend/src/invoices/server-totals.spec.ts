import { serverInvoiceTotals } from './server-totals';

describe('server-side invoice totals', () => {
  const base = { items: [{ productId: 'a', productName: 'x', quantity: 3, unit: 'بسته', unitPrice: 10001, totalPrice: 1 }], discount: 0, shippingPayer: 'none' as const, shippingCost: 0 } as any;

  it('ignores client totals and recomputes goods from quantity × price', () => {
    const t = serverInvoiceTotals({ ...base, totalAmount: 1, finalAmount: 1 });
    expect(t.totalAmount).toBe(30003);
    expect(t.finalAmount).toBe(30003);
    expect(t.items[0].totalPrice).toBe(30003);
  });

  it('subtracts discount and never goes below zero', () => {
    expect(serverInvoiceTotals({ ...base, discount: 5000 }).finalAmount).toBe(25003);
    expect(serverInvoiceTotals({ ...base, discount: 999999 }).finalAmount).toBe(0);
  });

  it('adds shipping only when the customer pays it', () => {
    expect(serverInvoiceTotals({ ...base, shippingPayer: 'customer', shippingCost: 2000 }).finalAmount).toBe(32003);
    expect(serverInvoiceTotals({ ...base, shippingPayer: 'me', shippingCost: 2000 }).finalAmount).toBe(30003);
  });
});
