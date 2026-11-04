import { priceOn, type PeriodRow } from '../pricing/price-period.service';
import { derivedProfitSet, historicalSaleProfit, onlyDerivedProfitFields } from './sale-profit';

const period = (unitPrice: number, from: string, to?: string): PeriodRow => ({
  productId: 'sugar',
  productName: 'قند',
  unitPrice,
  pricePerKg: 0,
  from: new Date(`${from}T12:00:00+03:30`),
  to: to ? new Date(`${to}T12:00:00+03:30`) : undefined,
  invoiceId: from,
  invoiceNumber: from,
});

const periods = [period(800_000, '2026-10-01', '2026-10-20'), period(1_000_000, '2026-10-20')];

describe('historicalSaleProfit', () => {
  const sale = (day: string, unitPrice = 900_000) => ({
    invoiceDate: new Date(`${day}T12:00:00+03:30`),
    discount: 0,
    items: [{ productId: 'sugar', quantity: 2, totalPrice: unitPrice * 2, unitPrice }],
  });

  it('uses the buy price of the invoice day, not a later purchase', () => {
    const old = historicalSaleProfit(sale('2026-10-15'), periods);
    expect(old.lines[0].unitCost).toBe(800_000);
    expect(old.profitAmount).toBe(200_000);
    const later = historicalSaleProfit(sale('2026-10-25'), periods);
    expect(later.lines[0].unitCost).toBe(1_000_000);
    expect(later.profitAmount).toBe(-200_000);
    expect(priceOn(periods, 'sugar', '2026-11-04')).toBe(1_000_000);
  });

  it('does not invent a cost when that day has no purchase', () => {
    const early = historicalSaleProfit(sale('2026-09-01'), periods);
    expect(early.lines[0].unitCost).toBe(0);
    expect(early.lines[0].unresolved).toBe(true);
    expect(early.profitAmount).toBe(0);
  });

  it('writes only derived profit fields', () => {
    const next = historicalSaleProfit(sale('2026-10-15'), periods);
    const set = derivedProfitSet(next.lines, next.costAmount, next.profitAmount);
    expect(onlyDerivedProfitFields(set)).toBe(true);
    expect(set['items.0.unitCost']).toBe(800_000);
    expect(Object.keys(set).some((key) => key.includes('unitPrice') || key.includes('totalPrice'))).toBe(false);
  });
});
