/**
 * Jalali (Persian) calendar helpers. Dates travel through the app as Gregorian `YYYY-MM-DD`
 * strings (what the API expects); these helpers only convert for display and picking.
 * Conversion follows the jalaali-js algorithm (Borkowski's leap-year breaks).
 */

const div = (a: number, b: number) => ~~(a / b);
const mod = (a: number, b: number) => a - ~~(a / b) * b;

const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

function jalCal(jy: number) {
  const gy = jy + 621;
  let leapJ = -14;
  let jp = BREAKS[0];
  let jump = 0;
  for (let i = 1; i < BREAKS.length; i++) {
    const jm = BREAKS[i];
    jump = jm - jp;
    if (jy < jm) break;
    leapJ += div(jump, 33) * 8 + div(mod(jump, 33), 4);
    jp = jm;
  }
  let n = jy - jp;
  leapJ += div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
  if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;
  const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
  const march = 20 + leapJ - leapG;
  if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
  let leap = mod(mod(n + 1, 33) - 1, 4);
  if (leap === -1) leap = 4;
  return { leap, gy, march };
}

function g2d(gy: number, gm: number, gd: number) {
  let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4) + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
  d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
  return d;
}

function d2g(jdn: number) {
  let j = 4 * jdn + 139361631;
  j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
  const i = div(mod(j, 1461), 4) * 5 + 308;
  const gd = div(mod(i, 153), 5) + 1;
  const gm = mod(div(i, 153), 12) + 1;
  const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
  return { gy, gm, gd };
}

function j2d(jy: number, jm: number, jd: number) {
  const r = jalCal(jy);
  return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
}

function d2j(jdn: number) {
  const { gy } = d2g(jdn);
  let jy = gy - 621;
  const r = jalCal(jy);
  let k = jdn - g2d(gy, 3, r.march);
  if (k >= 0) {
    if (k <= 185) return { jy, jm: 1 + div(k, 31), jd: mod(k, 31) + 1 };
    k -= 186;
  } else {
    jy -= 1;
    k += 179;
    if (r.leap === 1) k += 1;
  }
  return { jy, jm: 7 + div(k, 30), jd: mod(k, 30) + 1 };
}

export interface JDate {
  jy: number;
  jm: number;
  jd: number;
}

export const JALALI_MONTHS = [
  'فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
  'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند',
];
/** Week starts on Saturday. */
export const JALALI_WEEKDAYS = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];

export const isJalaliLeap = (jy: number) => jalCal(jy).leap === 0;

export const jalaliMonthLength = (jy: number, jm: number) =>
  jm <= 6 ? 31 : jm <= 11 ? 30 : isJalaliLeap(jy) ? 30 : 29;

const pad = (n: number) => String(n).padStart(2, '0');

export function toJalali(gy: number, gm: number, gd: number): JDate {
  return d2j(g2d(gy, gm, gd));
}

export function toGregorian(jy: number, jm: number, jd: number) {
  return d2g(j2d(jy, jm, jd));
}

/** Gregorian YYYY-MM-DD → Jalali parts. */
export function ymdToJalali(ymd: string): JDate {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return toJalali(y, m, d);
}

/** Jalali parts → Gregorian YYYY-MM-DD. */
export function jalaliToYmd(jy: number, jm: number, jd: number) {
  const g = toGregorian(jy, jm, jd);
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
}

/** Local calendar day of a Date as YYYY-MM-DD (not UTC, unlike toISOString). */
export function dateToYmd(d: Date = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const todayYmd = () => dateToYmd(new Date());

export function addDaysYmd(ymd: string, days: number) {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return dateToYmd(dt);
}

/** 0 = Saturday … 6 = Friday */
export function weekdayIndex(ymd: string) {
  const [y, m, d] = ymd.split('-').map(Number);
  return (new Date(y, m - 1, d).getDay() + 1) % 7;
}

export const faNum = (n: number | string) => String(n).replace(/\d/g, (c) => '۰۱۲۳۴۵۶۷۸۹'[+c]);

/** "۵ مهر ۱۴۰۵" */
export function formatJalali(ymd: string | undefined | null, opts: { year?: boolean; weekday?: boolean } = {}) {
  if (!ymd) return '';
  const j = ymdToJalali(ymd);
  const parts = `${faNum(j.jd)} ${JALALI_MONTHS[j.jm - 1]}${opts.year === false ? '' : ` ${faNum(j.jy)}`}`;
  if (!opts.weekday) return parts;
  const names = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
  return `${names[weekdayIndex(ymd)]} ${parts}`;
}

/** Like formatJalali, for API timestamps (uses the local day, not the UTC one). */
export function formatJalaliIso(iso: string | Date | undefined | null, opts: { year?: boolean; weekday?: boolean } = {}) {
  if (!iso) return '';
  return formatJalali(dateToYmd(new Date(iso)), opts);
}

/** "۱۴۰۵/۰۷/۰۵" */
export function formatJalaliNumeric(ymd: string | undefined | null) {
  if (!ymd) return '';
  const j = ymdToJalali(ymd);
  return faNum(`${j.jy}/${pad(j.jm)}/${pad(j.jd)}`);
}

/** First and last Gregorian day of a Jalali month. */
export function jalaliMonthRange(jy: number, jm: number) {
  return { from: jalaliToYmd(jy, jm, 1), to: jalaliToYmd(jy, jm, jalaliMonthLength(jy, jm)) };
}
