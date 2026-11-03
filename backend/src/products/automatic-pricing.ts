import { BadRequestException } from '@nestjs/common';
export interface CategoryBasePrice {
  category: string;
  amount: number;
  unit: 'kg' | 'unit';
  retailPercent?: number;
  supermarketPercent?: number;
  wholesalePercent?: number;
  distributorPercent?: number;
}
export function automaticPrice(product: {
  category: string; unit: string; weightPerUnitKg?: number; hasDualUnit?: boolean; secondaryUnit?: string; unitRatio?: number;
  commissionAmount?: number; commissionPercent?: number; commissionUnit?: string;
  buyPrice?: number; basePrice?: number; packageFee?: number;
}, rule: CategoryBasePrice | undefined) {
  const kg = product.weightPerUnitKg || (product.hasDualUnit && product.secondaryUnit === 'کیلوگرم' ? product.unitRatio || 0 : 0) || (product.unit === 'کیلوگرم' ? 1 : 0);
  const buy = Math.round(Number(product.buyPrice) || 0);
  const own = Math.round(Number(product.basePrice) || 0);
  const pack = Math.round(Number(product.packageFee) || 0);
  const kgFee = product.commissionUnit === 'kg' && (product.commissionAmount || 0) > 0;
  if ((rule?.unit === 'kg' || kgFee) && !(kg > 0))
    throw new BadRequestException('برای قیمت یا کارمزد کیلویی، وزن هر واحد محصول را وارد کنید');
  let base = 0;
  if (own > 0) {
    if (kg > 0) base = own * kg;
    else base = own;
  } else if (rule) {
    base = rule.amount * (rule.unit === 'kg' ? kg : 1);
  } else if (buy > 0) {
    base = buy;
  } else {
    throw new BadRequestException('ابتدا قیمت پایه را مشخص کنید. قیمت پایه همان قیمت خرید این کالا است.');
  }
  const perKgFee = kgFee ? (product.commissionAmount || 0) * kg : 0;
  const perPackFee = (product.commissionUnit === 'unit' ? product.commissionAmount || 0 : 0) + pack;
  return Math.round((base + perKgFee + perPackFee) * (1 + (product.commissionPercent || 0) / 100));
}

/** Cost of one package, then a separate profit percent for each sale channel. */
export function channelPrices(product: Parameters<typeof automaticPrice>[0], rule: CategoryBasePrice | undefined) {
  const hasChannel = rule && [rule.retailPercent, rule.supermarketPercent, rule.wholesalePercent, rule.distributorPercent].some((n) => n !== undefined && n !== null);
  if (!hasChannel) {
    const price = automaticPrice(product, rule);
    return { retail: price, supermarket: price, wholesale: price, distributor: price };
  }
  const cost = automaticPrice({ ...product, commissionPercent: 0 }, rule);
  const apply = (pct: number | undefined) => Math.round(cost * (1 + (Number(pct) || 0) / 100));
  return {
    retail: apply(rule?.retailPercent),
    supermarket: apply(rule?.supermarketPercent),
    wholesale: apply(rule?.wholesalePercent),
    distributor: apply(rule?.distributorPercent),
  };
}
