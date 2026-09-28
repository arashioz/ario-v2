const fa = (n: number, digits = 0) =>
  n.toLocaleString('fa-IR', { maximumFractionDigits: digits, minimumFractionDigits: 0 });

/*
 * Money is always shown in full toman with thousands separators — never shortened
 * ("میلیون", "M", "ت"). Use `formatToman` for strings and `<Toman>` (components/ui/Toman) in JSX.
 */

/** "۲۳۴٬۲۱۴٬۴۰۸" — digits only, when the unit is printed separately. */
export const toman = (n: number | null | undefined) => fa(Math.round(n ?? 0));

/** "۲۳۴٬۲۱۴٬۴۰۸ تومان" */
export const formatToman = (n: number | null | undefined) => `${toman(n)} تومان`;

/** "+۱۲٬۰۰۰ تومان" / "−۱۲٬۰۰۰ تومان" */
export const formatTomanSigned = (n: number | null | undefined) => {
  const v = Math.round(n ?? 0);
  return `${v > 0 ? '+' : v < 0 ? '−' : ''}${toman(Math.abs(v))} تومان`;
};

/** User-typed amount (Persian/Arabic digits, separators) → number. */
export const parseToman = (s: string) =>
  Number(
    s
      .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
      .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      .replace(/[^0-9]/g, ''),
  ) || 0;

export const toEnDigits = (s: string) =>
  (s || '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));

/** Weight: under a ton in kg, otherwise tons. */
export function weight(kg: number | null | undefined) {
  const v = kg ?? 0;
  if (Math.abs(v) >= 1000) return `${fa(v / 1000, 2)} تن`;
  return `${fa(v, 1)} کیلو`;
}

export const tons = (kg: number | null | undefined) => fa((kg ?? 0) / 1000, 2);

export const percent = (n: number | null | undefined, digits = 1) => `${fa(n ?? 0, digits)}٪`;

export const num = (n: number | null | undefined, digits = 0) => fa(n ?? 0, digits);

/** Typed quantity/weight (Persian digits, "٫" or "." as decimal point) → number. */
export const parseDecimal = (s: string) => {
  const latin = s
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/[٫,/]/g, '.')
    .replace(/[^0-9.]/g, '');
  const [int, ...rest] = latin.split('.');
  const v = Number(rest.length ? `${int || '0'}.${rest.join('')}` : int);
  return Number.isFinite(v) ? v : 0;
};

/** Persian/Arabic digits and letters folded so search matches however the name was typed. */
export const searchKey = (s: string) =>
  (s || '')
    .replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
    .replace(/ي/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[\u200c\s]+/g, ' ')
    .trim()
    .toLowerCase();

export const profitColor = (n: number) => (n > 0 ? 'text-emerald-600' : n < 0 ? 'text-rose-600' : 'text-slate-500');
