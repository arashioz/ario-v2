/** Compact Jalali helpers for server-side CRM windows (Tehran calendar day). */

const div = (a: number, b: number) => ~~(a / b);
const mod = (a: number, b: number) => a - ~~(a / b) * b;
const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210, 1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];
const pad = (n: number) => String(n).padStart(2, '0');

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
  return d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
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

const tehranDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' });

export const dayKey = (d: Date | string) => tehranDay.format(new Date(d));

export const ymdToJalali = (ymd: string) => {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number);
  return d2j(g2d(y, m, d));
};

export const jalaliToYmd = (jy: number, jm: number, jd: number) => {
  const g = d2g(j2d(jy, jm, jd));
  return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
};

export const jalaliMonthLength = (jy: number, jm: number) =>
  jm <= 6 ? 31 : jm <= 11 ? 30 : jalCal(jy).leap === 0 ? 30 : 29;

export const jalaliMonthRange = (jy: number, jm: number) => ({
  from: jalaliToYmd(jy, jm, 1),
  to: jalaliToYmd(jy, jm, jalaliMonthLength(jy, jm)),
});

/** Previous Jalali month, last Jalali year, and "this month so far" in Gregorian YYYY-MM-DD. */
export function crmWindows(now = new Date()) {
  const today = dayKey(now);
  const j = ymdToJalali(today);
  const thisMonth = jalaliMonthRange(j.jy, j.jm);
  const prevIdx = j.jy * 12 + j.jm - 2;
  const pj = { jy: Math.floor(prevIdx / 12), jm: (prevIdx % 12) + 1 };
  const lastMonth = jalaliMonthRange(pj.jy, pj.jm);
  const lastYear = { from: jalaliToYmd(j.jy - 1, 1, 1), to: jalaliToYmd(j.jy - 1, 12, jalaliMonthLength(j.jy - 1, 12)) };
  return { today, thisMonth: { from: thisMonth.from, to: today }, lastMonth, lastYear };
}
