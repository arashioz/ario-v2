import { BadRequestException } from '@nestjs/common';
export interface CategoryBasePrice { category: string; amount: number; unit: 'kg' | 'unit' }
export function automaticPrice(product: {
  category: string; unit: string; weightPerUnitKg?: number; hasDualUnit?: boolean; secondaryUnit?: string; unitRatio?: number;
  commissionAmount?: number; commissionPercent?: number; commissionUnit?: string;
}, rule: CategoryBasePrice | undefined) {
  if (!rule) throw new BadRequestException('ابتدا قیمت پایهٔ دسته‌بندی این محصول را ثبت کنید');
  const kg = product.weightPerUnitKg || (product.hasDualUnit && product.secondaryUnit === 'کیلوگرم' ? product.unitRatio || 0 : 0) || (product.unit === 'کیلوگرم' ? 1 : 0);
  if ((rule.unit === 'kg' || product.commissionUnit === 'kg' && product.commissionAmount > 0) && !(kg > 0))
    throw new BadRequestException('برای قیمت یا کارمزد کیلویی، وزن هر واحد محصول را وارد کنید');
  const base = rule.amount * (rule.unit === 'kg' ? kg : 1);
  const fee = (product.commissionAmount || 0) * (product.commissionUnit === 'kg' ? kg : 1);
  return Math.round(base * (1 + (product.commissionPercent || 0) / 100) + fee);
}
