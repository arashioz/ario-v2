import { automaticPrice, channelPrices } from './automatic-pricing';

describe('category base and product commissions', () => {
  const product = { category: 'نبات', unit: 'بسته', weightPerUnitKg: 3, commissionAmount: 2000, commissionPercent: 5, commissionUnit: 'kg' };
  it('adds kg commission once after converting category kg price to the package', () => {
    expect(automaticPrice(product, { category: 'نبات', amount: 10000, unit: 'kg' })).toBe(37800);
  });
  it('uses flat package commission without multiplying by package weight', () => {
    expect(automaticPrice({ ...product, commissionUnit: 'unit' }, { category: 'نبات', amount: 10000, unit: 'kg' })).toBe(33600);
  });
  it('does not add an implicit 2000 or round prices to a larger step', () => {
    expect(automaticPrice({ ...product, commissionAmount: 0, commissionPercent: 0 }, { category: 'نبات', amount: 12345, unit: 'unit' })).toBe(12345);
  });
  it('rejects missing weight and missing category bases', () => {
    expect(() => automaticPrice({ ...product, weightPerUnitKg: 0 }, { category: 'نبات', amount: 10000, unit: 'kg' })).toThrow('وزن');
    expect(() => automaticPrice(product, undefined)).toThrow('قیمت پایه');
  });
  it('uses the purchase price as the base when the category has no list price', () => {
    expect(automaticPrice({ ...product, buyPrice: 20000, commissionAmount: 0, commissionPercent: 10 }, undefined)).toBe(22000);
  });
  it('uses the product base per kilogram plus a flat package amount', () => {
    expect(automaticPrice({ ...product, basePrice: 10000, packageFee: 1500, commissionAmount: 2000, commissionPercent: 0 }, undefined)).toBe(37500);
  });
  it('applies a different percent to each sale channel from the same base', () => {
    const tiers = channelPrices(
      { ...product, commissionAmount: 0, commissionPercent: 0 },
      { category: 'نبات', amount: 10000, unit: 'kg', retailPercent: 10, supermarketPercent: 5, wholesalePercent: 2 },
    );
    expect(tiers).toEqual({ retail: 33000, supermarket: 31500, wholesale: 30600 });
  });
});
