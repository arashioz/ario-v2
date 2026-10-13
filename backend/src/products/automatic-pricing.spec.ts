import { automaticPrice } from './automatic-pricing';

describe('category base and product commissions', () => {
  const product = { category: 'نبات', unit: 'بسته', weightPerUnitKg: 3, commissionAmount: 2000, commissionPercent: 5, commissionUnit: 'kg' };
  it('adds kg commission once after converting category kg price to the package', () => {
    expect(automaticPrice(product, { category: 'نبات', amount: 10000, unit: 'kg' })).toBe(37500);
  });
  it('uses flat package commission without multiplying by package weight', () => {
    expect(automaticPrice({ ...product, commissionUnit: 'unit' }, { category: 'نبات', amount: 10000, unit: 'kg' })).toBe(33500);
  });
  it('does not add an implicit 2000 or round prices to a larger step', () => {
    expect(automaticPrice({ ...product, commissionAmount: 0, commissionPercent: 0 }, { category: 'نبات', amount: 12345, unit: 'unit' })).toBe(12345);
  });
  it('rejects missing weight and missing category bases', () => {
    expect(() => automaticPrice({ ...product, weightPerUnitKg: 0 }, { category: 'نبات', amount: 10000, unit: 'kg' })).toThrow('وزن');
    expect(() => automaticPrice(product, undefined)).toThrow('قیمت پایه');
  });
});
