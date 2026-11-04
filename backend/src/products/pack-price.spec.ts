import { feePerKg, lotSpread, sellFromBase } from './pack-price';

describe('pack price', () => {
  it('turns a 500 toman fee on a 3kg pack into a per-kilo fee and keeps the pack exact', () => {
    expect(feePerKg(500, 'unit', 3)).toBeCloseTo(500 / 3);
    const priced = sellFromBase({ basePerKg: 160, fee: 500, feeUnit: 'unit', percent: 0, kg: 3 });
    expect(priced.pack).toBe(980);
  });

  it('applies the percent on the per-kilo base', () => {
    const priced = sellFromBase({ basePerKg: 160, fee: 0, feeUnit: 'unit', percent: 3.125, kg: 3 });
    expect(priced.sellPerKg).toBeCloseTo(165);
    expect(priced.pack).toBe(495);
  });

  it('splits a 130 lot against a 160 base and a 165 sell price', () => {
    const spread = lotSpread(130, 160, 165, 3);
    expect(spread.inflation).toBe(90);
    expect(spread.real).toBe(15);
    expect(spread.profit).toBe(105);
  });
});