import { formatToman, num } from './format';

interface SaleLossLine {
  name: string;
  quantity: number;
  unitPrice: number;
  /** Cost per primary stock unit, matching unitPrice. */
  unitCost: number;
}

/** Warn before any write/queue operation; never change the entered sale prices. */
export function confirmSaleLoss(lines: SaleLossLine[], discount = 0, factory = false, proforma = false): boolean {
  const gross = lines.reduce((sum, line) => sum + Math.round(line.quantity * line.unitPrice), 0);
  const factor = gross > 0 ? Math.max(0, gross - Math.max(0, discount)) / gross : 1;
  const losses = lines.map((line) => ({
    name: line.name,
    loss: line.quantity * line.unitCost - Math.round(line.quantity * line.unitPrice) * factor,
  })).filter((line) => line.loss > 0.5);
  if (!losses.length) return true;
  const details = losses.slice(0, 5).map((line) => `• ${line.name}: ${formatToman(Math.round(line.loss))}`).join('\n');
  const more = losses.length > 5 ? `\nو ${num(losses.length - 5)} قلم دیگر` : '';
  const basis = factory ? 'قیمت کارخانهٔ همین فاکتور' : 'بهای خرید فعلی محصولات';
  return window.confirm(
    `هشدار فروش با ضرر\nقیمت فروش بعضی اقلام پس از تخفیف، از ${basis} کمتر است.\n${details}${more}\n` +
    `جمع زیان احتمالی این اقلام: ${formatToman(Math.round(losses.reduce((sum, line) => sum + line.loss, 0)))}\n` +
    (!factory ? 'برای فاکتورهای قدیمی، سود و زیان نهایی طبق سوابق خرید در تاریخ فاکتور محاسبه می‌شود.\n' : '') +
    `آیا ${proforma ? 'پیش‌فاکتور' : 'فاکتور'} با این قیمت‌ها و با احتمال ضرر ثبت شود؟`,
  );
}
