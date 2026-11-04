import { priceOn, type PeriodRow } from './price-period.service';

const row = (productId: string, unitPrice: number, from: string, to?: string): PeriodRow => ({
  productId,
  productName: productId,
  unitPrice,
  pricePerKg: 0,
  from: new Date(`${from}T12:00:00+03:30`),
  to: to ? new Date(`${to}T12:00:00+03:30`) : undefined,
  invoiceId: from,
  invoiceNumber: from,
});

describe('priceOn', () => {
  const periods = [
    row('sugar', 800_000, '2026-10-01', '2026-10-20'),
    row('sugar', 1_000_000, '2026-10-20'),
    row('candy', 50_000, '2026-10-05'),
  ];

  it('uses the landed cost in force on that day, not a later purchase', () => {
    expect(priceOn(periods, 'sugar', '2026-10-15')).toBe(800_000);
    expect(priceOn(periods, 'sugar', '2026-10-19')).toBe(800_000);
  });

  it('switches on the day the next purchase price starts', () => {
    expect(priceOn(periods, 'sugar', '2026-10-20')).toBe(1_000_000);
    expect(priceOn(periods, 'sugar', '2026-11-04')).toBe(1_000_000);
  });

  it('does not borrow another product or a future price', () => {
    expect(priceOn(periods, 'sugar', '2026-09-30')).toBe(0);
    expect(priceOn(periods, 'candy', '2026-10-04')).toBe(0);
    expect(priceOn(periods, 'candy', '2026-10-15')).toBe(50_000);
    expect(priceOn(periods, 'missing', '2026-11-04')).toBe(0);
  });
});
