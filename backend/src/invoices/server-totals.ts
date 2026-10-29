import { CreateInvoiceDto } from './dto/create-invoice.dto';

/** Pure money rule for an invoice: goods = Σ qty × unit price, final = max(0, goods − discount) + customer shipping. */
export function serverInvoiceTotals(dto: CreateInvoiceDto): CreateInvoiceDto {
  const items = (dto.items || []).map((it) => ({
    ...it,
    totalPrice: Math.round((Number(it.quantity) || 0) * (Number(it.unitPrice) || 0)),
  }));
  const goods = items.reduce((sum, it) => sum + it.totalPrice, 0);
  const discount = Math.max(0, Math.round(Number(dto.discount) || 0));
  const shipping = dto.shippingPayer === 'customer' ? Math.max(0, Math.round(Number(dto.shippingCost) || 0)) : 0;
  return { ...dto, items, totalAmount: goods, discount, finalAmount: Math.max(0, goods - discount) + shipping };
}
