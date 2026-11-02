import { BadRequestException } from '@nestjs/common';
export interface CategoryBasePrice { category: string; amount: number; unit: 'kg' | 'unit' }
export function automaticPrice(product: {
  category: string; unit: string; weightPerUnitKg?: number; hasDualUnit?: boolean; secondaryUnit?: string; unitRatio?: number;
  commissionAmount?: number; commissionPercent?: number; commissionUnit?: string;
  buyPrice?: number;
}, rule: CategoryBasePrice | undefined) {
  const kg = product.weightPerUnitKg || (product.hasDualUnit && product.secondaryUnit === 'کیلوگرم' ? product.unitRatio || 0 : 0) || (product.unit === 'کیلوگرم' ? 1 : 0);
  const buy = Math.round(Number(product.buyPrice) || 0);
  let base = 0;
  if (rule) {
    if ((rule.unit === 'kg' || (product.commissionUnit === 'kg' && (product.commissionAmount || 0) > 0)) && !(kg > 0))
      throw new BadRequestException('برای قیمت یا کارمزد کیلویی، وزن هر واحد محصول را وارد کنید');
    base = rule.amount * (rule.unit === 'kg' ? kg : 1);
  } else if (buy > 0) {
    if (product.commissionUnit === 'kg' && (product.commissionAmount || 0) > 0 && !(kg > 0))
      throw new BadRequestException('برای کارمزد کیلویی، وزن هر واحد محصول را وارد کنید');
    base = buy;
  } else {
    throw new BadRequestException('ابتدا قیمت پایه را مشخص کنید. قیمت پایه همان قیمت خرید این کالا است.');
  }
  const fee = (product.commissionAmount || 0) * (product.commissionUnit === 'kg' ? kg : 1);
  return Math.round((base + fee) * (1 + (product.commissionPercent || 0) / 100));
}
