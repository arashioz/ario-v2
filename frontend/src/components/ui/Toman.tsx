import { toman } from '../../lib/format';

interface TomanProps {
  value: number | null | undefined;
  /** Prefix + / − for non-zero values. */
  signed?: boolean;
  /** Hide the "تومان" unit (e.g. in dense table cells whose header already says تومان). */
  bare?: boolean;
  className?: string;
  unitClassName?: string;
}

/** Money in full toman with thousands separators: "۲۳۴٬۲۱۴٬۴۰۸ تومان". */
export default function Toman({ value, signed, bare, className = '', unitClassName = 'text-[0.75em] font-normal opacity-70' }: TomanProps) {
  const v = Math.round(value ?? 0);
  const sign = signed ? (v > 0 ? '+' : v < 0 ? '−' : '') : v < 0 ? '−' : '';
  return (
    <span className={`whitespace-nowrap ${className}`} dir="rtl">
      <span className="font-mono">
        {sign}
        {toman(Math.abs(v))}
      </span>
      {!bare && <span className={`ms-1 ${unitClassName}`}>تومان</span>}
    </span>
  );
}
