/** Matches the server: a pack fee is divided by the kilos, then the percent is applied. The pack price is rounded only at the end. */
export function feePerKg(fee: number, feeUnit: 'kg' | 'unit', kg: number) {
  if (!(fee > 0)) return 0;
  if (feeUnit === 'kg' || !(kg > 0)) return fee;
  return fee / kg;
}

export function sellFromBase(input: { basePerKg: number; fee?: number; feeUnit?: 'kg' | 'unit'; feePerKg?: number; feePerPack?: number; percent: number; kg: number }) {
  const kg = input.kg > 0 ? input.kg : 0;
  const perKgFee = feePerKg(input.fee || 0, input.feeUnit || 'unit', kg) + (input.feePerKg || 0) + (kg > 0 ? (input.feePerPack || 0) / kg : input.feePerPack || 0);
  const sellPerKg = (input.basePerKg + perKgFee) * (1 + (input.percent || 0) / 100);
  const pack = kg > 0 ? sellPerKg * kg : sellPerKg;
  return { feePerKg: perKgFee, sellPerKg, pack: Math.round(pack) };
}
