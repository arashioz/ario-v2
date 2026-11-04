/** One purchase invoice is its own stock. Prices stay exact until the final toman. */
export function feePerKg(fee: number, feeUnit: 'kg' | 'unit', kg: number) {
  const amount = Number(fee) || 0;
  if (!(amount > 0)) return 0;
  if (feeUnit === 'kg' || !(kg > 0)) return amount;
  return amount / kg;
}

/** Sell one pack from a per-kilo base, a per-kilo fee, a per-pack fee, and a margin percent. */
export function sellFromBase(input: { basePerKg: number; fee?: number; feeUnit?: 'kg' | 'unit'; feePerKg?: number; feePerPack?: number; percent: number; kg: number }) {
  const kg = input.kg > 0 ? input.kg : 0;
  const perKgFee = feePerKg(input.fee || 0, input.feeUnit || 'unit', kg) + (Number(input.feePerKg) || 0) + (kg > 0 ? (Number(input.feePerPack) || 0) / kg : Number(input.feePerPack) || 0);
  const sellPerKg = ((Number(input.basePerKg) || 0) + perKgFee) * (1 + (Number(input.percent) || 0) / 100);
  const pack = kg > 0 ? sellPerKg * kg : sellPerKg;
  return { feePerKg: perKgFee, sellPerKg, pack: Math.round(pack) };
}

/**
 * A remaining lot bought at `buyPerKg`, against the base now in force and today's sell price.
 * Inflation is the rise from that invoice to the base. The rest is the percent and the fee.
 */
export function lotSpread(buyPerKg: number, basePerKg: number, sellPerKg: number, kg: number) {
  const weight = Number(kg) || 0;
  const inflation = (basePerKg - buyPerKg) * weight;
  const real = (sellPerKg - basePerKg) * weight;
  return { inflation, real, profit: inflation + real };
}
