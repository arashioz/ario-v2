import React, { useDeferredValue, useMemo, useState } from "react";
import { Package, Search, X } from "lucide-react";
import type { Product } from "../../services/products.service";
import { productImageUrl } from "../../services/products.service";
import {
  DEFAULT_POS_SECTIONS,
  DEFAULT_SETTINGS,
  type PosSection,
  type PosSectionId,
  type PosView,
  type SaleType,
} from "../../services/settings.service";
import { formatToman, num, weight } from "../../lib/format";
import { kgPerUnit, pricePerKg, stockKg, tierPrice } from "./cart";
import { sectionsOf, productSearchIndex, filterSections } from "./product-catalog";

const OTHER = "سایر";
const EMPTY_ORDER: string[] = [];
const EMPTY_SUB_ORDER: Record<string, string[]> = {};

interface Props {
  products: Product[];
  saleType: SaleType;
  /** productId → quantity already in the cart */
  inCart: Map<string, number>;
  onPick: (p: Product) => void;
  view?: PosView;
  /** Category heading order from shop settings. */
  categoryOrder?: string[];
  /** Subcategory order per category. */
  subcategoryOrder?: Record<string, string[]>;
  /** Product display order. */
  productOrder?: string[];
  /** Just the products, without search and category chips (settings preview). */
  bare?: boolean;
  /** Order and visibility of the sales-page blocks. */
  layout?: PosSection[];
  /** Blocks owned by the page (tier picker, cart), placed according to `layout`. */
  slots?: Partial<Record<PosSectionId, React.ReactNode>>;
  /** Factory shipments are not limited by Ario stock. */
  ignoreStock?: boolean;
}

const SIZES = {
  sm: {
    name: "text-[11px] font-semibold leading-[18px]",
    price: "text-[11px] font-bold",
    perKg: "text-[10px] font-medium",
    meta: "text-[9px]",
    img: "w-9 h-9",
  },
  md: {
    name: "text-[12px] font-bold leading-5",
    price: "text-[13px] font-extrabold",
    perKg: "text-[11px] font-bold",
    meta: "text-[10px]",
    img: "w-11 h-11",
  },
} as const;

interface CardProps {
  p: Product;
  saleType: SaleType;
  qty?: number;
  view: PosView;
  onPick: (p: Product) => void;
  ignoreStock?: boolean;
}

const Thumb: React.FC<{ p: Product; className: string }> = ({
  p,
  className,
}) =>
  p.image ? (
    <img
      src={productImageUrl(p.image)}
      alt=""
      loading="lazy"
      decoding="async"
      className={`${className} rounded-lg object-cover border border-slate-100 shrink-0`}
    />
  ) : (
    <div
      className={`${className} rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0`}
    >
      <Package className="w-4 h-4 text-slate-300" />
    </div>
  );

const QtyBadge: React.FC<{ qty?: number }> = ({ qty }) =>
  qty ? (
    <span className="absolute top-1 left-1 text-[9px] font-bold bg-sky-600 text-white rounded-full px-1.5 py-px font-mono">
      {num(qty, 2)}
    </span>
  ) : null;

const ProductCard = React.memo(function ProductCard({
  p,
  saleType,
  qty,
  view,
  onPick,
  ignoreStock,
}: CardProps) {
  const z = SIZES[view.size];
  const price = tierPrice(p, saleType);
  const k = kgPerUnit(p);
  const perKg = pricePerKg(price, p);
  const out = !ignoreStock && p.stock <= 0;
  const showKg = view.showPerKg && perKg > 0 && k !== 1;

  const priceLine = (
    <div className={`${z.price} font-mono text-sky-700`}>
      {formatToman(price)}{" "}
      <span className="text-[9px] font-normal text-slate-400">{p.unit}</span>
    </div>
  );
  const kgLine = showKg && (
    <div className={`${z.perKg} font-mono text-slate-500`}>
      {formatToman(perKg)}{" "}
      <span className="text-[9px] font-normal text-slate-400">کیلو</span>
    </div>
  );
  const stockLine = (out || view.showStock) && (
    <div className={`${z.meta} text-slate-400 truncate`}>
      {out ? (
        <span className="font-bold text-rose-600">ناموجود</span>
      ) : (
        <>
          {num(p.stock, 1)} {p.unit}
          {k > 0 && k !== 1 && ` · ${weight(stockKg(p))}`}
        </>
      )}
    </div>
  );
  const frame = `pos-product-card relative text-right border transition active:scale-[0.97] ${
    qty
      ? "bg-sky-50 border-sky-400 ring-2 ring-sky-100"
      : "bg-white border-slate-200"
  } ${out ? "pos-product-unavailable opacity-60" : ""}`;

  if (view.layout === "list") {
    return (
      <button
        onClick={() => onPick(p)}
        disabled={out}
        className={`${frame} w-full rounded-xl px-2.5 py-2 flex items-center gap-2`}
      >
        {view.showImages && <Thumb p={p} className={z.img} />}
        <div className="min-w-0 flex-1">
          <div className={`${z.name} text-slate-800 truncate`}>{p.name}</div>
          {stockLine}
        </div>
        <div className="text-left shrink-0">
          {priceLine}
          {kgLine}
        </div>
        <QtyBadge qty={qty} />
      </button>
    );
  }

  if (view.layout === "tiles") {
    return (
      <button
        onClick={() => onPick(p)}
        disabled={out}
        className={`${frame} rounded-xl p-1.5 flex flex-col gap-0.5`}
      >
        {view.showImages && <Thumb p={p} className="w-full h-14" />}
        <div className={`${z.name} text-slate-800 line-clamp-2`}>{p.name}</div>
        {priceLine}
        {kgLine}
        {stockLine}
        <QtyBadge qty={qty} />
      </button>
    );
  }

  return (
    <button
      onClick={() => onPick(p)}
      disabled={out}
      className={`${frame} rounded-2xl p-2 flex gap-2`}
    >
      {view.showImages && <Thumb p={p} className={z.img} />}
      <div className="min-w-0 flex-1">
        <div className={`${z.name} text-slate-800 line-clamp-2`}>{p.name}</div>
        {priceLine}
        {kgLine}
        {stockLine}
      </div>
      <QtyBadge qty={qty} />
    </button>
  );
});

const GRID: Record<PosView["layout"], string> = {
  grid: "grid grid-cols-2 gap-2",
  tiles: "grid grid-cols-3 gap-1.5",
  list: "space-y-1.5",
};

/** Every product on one page, under category titles; chips narrow to one category. */
export const ProductBrowser: React.FC<Props> = ({
  products,
  saleType,
  inCart,
  onPick,
  view = DEFAULT_SETTINGS.posView,
  categoryOrder = EMPTY_ORDER,
  subcategoryOrder = EMPTY_SUB_ORDER,
  productOrder = EMPTY_ORDER,
  bare,
  layout = DEFAULT_POS_SECTIONS,
  slots = {},
  ignoreStock,
}) => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const all = useMemo(
    () => sectionsOf(products, categoryOrder, subcategoryOrder, productOrder),
    [products, categoryOrder, subcategoryOrder, productOrder],
  );
  // Normalize once per catalog refresh and preserve its pre-sorted groups while filtering.
  const searchable = useMemo(() => productSearchIndex(products), [products]);
  const deferredQuery = useDeferredValue(query);
  const sections = useMemo(() => filterSections(all, searchable, deferredQuery, category), [all, searchable, deferredQuery, category]);

  const search = (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="جستجوی کالا"
            placeholder="جستجوی کالا، دسته یا بارکد…"
            className="w-full pr-10 pl-9 py-2.5 text-[13px] rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none shadow-sm"
          />
          {query && (
            <button
              aria-label="پاک کردن جستجو"
              onClick={() => setQuery("")}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
  );

  const categories = all.length > 1 && (
        <div className="pos-categories flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {[null, ...all.map((s) => s.name)].map((c) => (
            <button
              key={c ?? "all"}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`px-3 py-1.5 rounded-xl text-[11px] font-bold whitespace-nowrap transition ${
                category === c
                  ? "bg-sky-600 text-white"
                  : "bg-white text-slate-600 border border-slate-200"
              }`}
            >
              {c ?? "همه"}
            </button>
          ))}
        </div>
  );

  const list = useMemo(() => (
    <div className="pos-product-list space-y-3">
      {sections.length === 0 ? (
        <div className="pos-empty py-8 text-center text-xs text-slate-400">
          کالایی پیدا نشد.
        </div>
      ) : (
        sections.map((s) => (
          <section key={s.name} className="space-y-2">
            <h2 className="pos-category-title flex items-center gap-2 text-[13px] font-extrabold text-slate-800 pt-1">
              <span className="w-1 h-4 rounded-full bg-sky-500" />
              {s.name}
              <span className="text-[10px] font-normal text-slate-400">
                {num(s.count)} کالا
              </span>
            </h2>
            {s.groups.map((g) => (
              <div key={g.name || OTHER} className="space-y-1.5">
                {s.groups.length > 1 && g.name && (
                  <h3 className="pos-subcategory-title text-[11px] font-bold text-slate-500 pr-3">
                    {g.name}
                  </h3>
                )}
                <div className={GRID[view.layout]}>
                  {g.products.map((p) => (
                    <ProductCard
                      key={p._id}
                      p={p}
                      saleType={saleType}
                      qty={inCart.get(p._id)}
                      view={view}
                      onPick={onPick}
                      ignoreStock={ignoreStock}
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  ), [sections, view, saleType, inCart, onPick, ignoreStock]);

  if (bare) return list;

  const blocks: Record<PosSectionId, React.ReactNode> = {
    tiers: slots.tiers,
    cart: slots.cart,
    search,
    categories,
    products: list,
  };
  return (
    <div className="space-y-3" aria-busy={query !== deferredQuery}>
      {layout
        .filter((s) => s.visible || s.id === "products")
        .map((s) => blocks[s.id] ? <React.Fragment key={s.id}>{blocks[s.id]}</React.Fragment> : null)}
    </div>
  );
};
