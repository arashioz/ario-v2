import type { Invoice } from '../services/invoices.service';
import type { Proforma } from '../services/proformas.service';
import type { Customer } from '../services/customers.service';
import type { AppSettings, BankCard, SmsTemplateKey } from '../services/settings.service';
import { dateToYmd, formatJalaliIso, formatJalaliNumeric, faNum } from './jalali';
import { formatToman, num, weight } from './format';

type Vars = Record<string, string>;

const PAYMENT_LABELS: Record<string, string> = {
  pos: 'کارتخوان',
  cash: 'نقدی',
  transfer: 'کارت به کارت',
  cheque: 'چک',
  credit: 'نسیه',
  split: 'ترکیبی',
};

/**
 * Fill {placeholders}. A line containing a placeholder that resolves to an empty value is dropped,
 * so optional lines ("تخفیف: {discount}") disappear when they don't apply.
 */
export function renderSms(template: string, vars: Vars): string {
  const out: string[] = [];
  for (const line of template.split('\n')) {
    let empty = false;
    const filled = line.replace(/\{(\w+)\}/g, (m, key: string) => {
      if (!(key in vars)) return m;
      if (!vars[key]) empty = true;
      return vars[key];
    });
    if (!empty) out.push(filled);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

export const defaultBankCard = (cards: BankCard[]) => cards.find((c) => c.isDefault) ?? cards[0];

const cardVars = (s: AppSettings): Vars => {
  const c = defaultBankCard(s.bankCards || []);
  return {
    card: c?.cardNumber ? faNum(c.cardNumber.replace(/(\d{4})(?=\d)/g, '$1-')) : '',
    sheba: c?.iban || '',
    holder: c?.accountHolder || '',
    bank: c?.bankName || '',
  };
};

const shopVars = (s: AppSettings): Vars => ({
  shop: s.shopName || 'فروشگاه آریو',
  phone: s.shopPhone ? faNum(s.shopPhone) : '',
  footer: s.invoiceFooter || '',
});

const itemLines = (items: { productName: string; quantity: number; unit: string; unitPrice: number; totalPrice: number }[]) =>
  items.map((it, i) => `${faNum(i + 1)}. ${it.productName}: ${num(it.quantity, 3)} ${it.unit} × ${formatToman(it.unitPrice)} = ${formatToman(it.totalPrice)}`).join('\n');

const money = (n?: number) => (n && n > 0 ? formatToman(n) : '');

const paymentText = (inv: Pick<Invoice, 'paymentMethod' | 'splitDetails'>) => {
  if (inv.paymentMethod !== 'split' || !inv.splitDetails) return PAYMENT_LABELS[inv.paymentMethod] || inv.paymentMethod;
  const s = inv.splitDetails;
  return (['pos', 'cash', 'transfer', 'cheque', 'credit'] as const)
    .filter((k) => (s[k] || 0) > 0)
    .map((k) => `${PAYMENT_LABELS[k]} ${formatToman(s[k])}`)
    .join('، ');
};

export function invoiceSms(inv: Invoice, s: AppSettings, customerBalance?: number): string {
  return renderSms(s.smsTemplates.invoice, {
    ...shopVars(s),
    ...cardVars(s),
    number: inv.invoiceNumber,
    date: formatJalaliIso(inv.invoiceDate || inv.createdAt),
    customer: inv.customerName,
    items: itemLines(inv.items),
    weight: inv.totalWeightKg ? weight(inv.totalWeightKg) : '',
    subtotal: formatToman(inv.totalAmount),
    discount: money(inv.discount),
    shipping: inv.shippingPayer === 'customer' ? money(inv.shippingCost) : '',
    total: formatToman(inv.finalAmount),
    payment: paymentText(inv),
    paid: money(inv.paidAmount),
    remaining: money(inv.remainingDebt),
    balance: customerBalance && customerBalance > 0 ? formatToman(customerBalance) : '',
  });
}

export function proformaSms(p: Proforma, s: AppSettings): string {
  return renderSms(s.smsTemplates.proforma, {
    ...shopVars(s),
    ...cardVars(s),
    number: p.number,
    date: formatJalaliIso(p.orderDate),
    customer: p.customerName,
    items: itemLines(p.items),
    weight: p.totalWeightKg ? weight(p.totalWeightKg) : '',
    subtotal: formatToman(p.totalAmount),
    discount: money(p.discount),
    shipping: p.shippingPayer === 'customer' ? money(p.shippingCost) : '',
    total: formatToman(p.finalAmount),
  });
}

/** Account statement for a customer: balance plus every open sale invoice. */
export function debtSms(customer: Pick<Customer, 'name' | 'balance'>, invoices: Invoice[], s: AppSettings): string {
  const open = invoices
    .filter((i) => i.type === 'sale' && i.remainingDebt > 0)
    .sort((a, b) => +new Date(a.invoiceDate || a.createdAt) - +new Date(b.invoiceDate || b.createdAt));
  return renderSms(s.smsTemplates.debt, {
    ...shopVars(s),
    ...cardVars(s),
    customer: customer.name,
    balance: formatToman(Math.max(0, customer.balance)),
    count: faNum(open.length),
    date: formatJalaliNumeric(dateToYmd()),
    invoices: open
      .map(
        (i) =>
          `- فاکتور ${i.invoiceNumber} (${formatJalaliNumeric(dateToYmd(new Date(i.invoiceDate || i.createdAt)))}): مبلغ ${formatToman(i.finalAmount)}${
            i.remainingDebt !== i.finalAmount ? `، مانده ${formatToman(i.remainingDebt)}` : ''
          }`,
      )
      .join('\n'),
  });
}

/** Sample values so the settings page can preview a template. */
export function sampleSms(key: SmsTemplateKey, s: AppSettings, template: string): string {
  const base: Vars = {
    ...shopVars(s),
    ...cardVars(s),
    number: key === 'proforma' ? 'PRE-050706-0001' : 'SAL-050706-0012',
    date: formatJalaliIso(new Date()),
    customer: 'سوپرمارکت نمونه',
    items: `۱. نایلون ۵ کیلویی: ۲۰ بسته × ${formatToman(700000)} = ${formatToman(14000000)}\n۲. شکسته کارتن ۳ کیلویی: ۱۰ کارتن × ${formatToman(480000)} = ${formatToman(4800000)}`,
    weight: weight(130),
    subtotal: formatToman(18800000),
    discount: formatToman(300000),
    shipping: '',
    total: formatToman(18500000),
    payment: `نقدی ${formatToman(5000000)}، نسیه ${formatToman(13500000)}`,
    paid: formatToman(5000000),
    remaining: formatToman(13500000),
    balance: formatToman(21000000),
    count: faNum(2),
    invoices: `- فاکتور SAL-050701-0003 (۱۴۰۵/۰۷/۰۱): مبلغ ${formatToman(7500000)}\n- فاکتور SAL-050706-0012 (۱۴۰۵/۰۷/۰۶): مبلغ ${formatToman(18500000)}، مانده ${formatToman(13500000)}`,
  };
  return renderSms(template, base);
}

/** Copy the text and open the phone's SMS app addressed to `phone`. */
export async function openSms(phone: string | undefined, text: string) {
  try {
    await navigator.clipboard?.writeText(text);
  } catch {
    /* clipboard can be blocked; the SMS app still gets the body */
  }
  const to = (phone || '').replace(/[^0-9+]/g, '');
  window.location.href = `sms:${to}?body=${encodeURIComponent(text)}`;
}
