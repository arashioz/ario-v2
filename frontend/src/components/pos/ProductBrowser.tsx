import React, { useMemo, useState } from "react";
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
import { formatToman, num, searchKey, weight } from "../../lib/format";
import { kgPerUnit, pricePerKg, stockKg, tierPrice } from "./cart";

const OTHER = "سایر";

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
}

interface Section {
  name: string;
  groups: { name: string; products: Product[] }[];
  count: number;
}

const byName = (a: string, b: string) =>
  a === OTHER ? 1 : b === OTHER ? -1 : a.localeCompare(b, "fa");

/** Category → sub-category sections. Named order first, then the rest by name. */
const sectionsOf = (
  list: Product[],
  order: string[] = [],
  subOrder: Record<string, string[]> = {},
  prodOrder: string[] = [],
): Section[] => {
  const cats = new Map<string, Map<string, Product[]>>();
  for (const p of list) {
    const c = p.category || OTHER;
    const s = p.subcategory || "";
    const subs = cats.get(c) ?? new Map<string, Product[]>();
    subs.set(s, [...(subs.get(s) ?? []), p]);
    cats.set(c, subs);
  }
  return [...cats.entries()]
    .map(([name, subs]) => {
      const preferredSubs = subOrder[name] || [];
      return {
        name,
        count: [...subs.values()].reduce((n, ps) => n + ps.length, 0),
        groups: [...subs.entries()]
          .map(([sub, ps]) => ({
            name: sub,
            products: [...ps].sort((a, b) => {
              const ia = prodOrder.indexOf(a._id);
              const ib = prodOrder.indexOf(b._id);
              if (ia !== -1 && ib !== -1) return ia - ib;
              if (ia !== -1) return -1;
              if (ib !== -1) return 1;
              return a.name.localeCompare(b.name, "fa");
            }),
          }))
          .sort((a, b) => {
            const sa = a.name || OTHER;
            const sb = b.name || OTHER;
            const ia = preferredSubs.indexOf(sa);
            const ib = preferredSubs.indexOf(sb);
            if (ia !== -1 && ib !== -1) return ia - ib;
            if (ia !== -1) return -1;
            if (ib !== -1) return 1;
            return byName(sa, sb);
          }),
      };
    })
    .sort((a, b) => {
      const ia = order.indexOf(a.name);
      const ib = order.indexOf(b.name);
      if (ia === -1 && ib === -1) return byName(a.name, b.name);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
};

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

const ProductCard: React.FC<CardProps> = ({
  p,
  saleType,
  qty,
  view,
  onPick,
}) => {
  const z = SIZES[view.size];
  const price = tierPrice(p, saleType);
  const k = kgPerUnit(p);
  const perKg = pricePerKg(price, p);
  const out = p.stock <= 0;
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
  const frame = `relative text-right border transition active:scale-[0.97] ${
    qty
      ? "bg-sky-50 border-sky-400 ring-2 ring-sky-100"
      : "bg-white border-slate-200"
  } ${out ? "opacity-50" : ""}`;

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
};

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
  categoryOrder = [],
  subcategoryOrder = {},
  productOrder = [],
  bare,
  layout = DEFAULT_POS_SECTIONS,
  slots = {},
}) => {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);

  const all = useMemo(
    () => sectionsOf(products, categoryOrder, subcategoryOrder, productOrder),
    [products, categoryOrder, subcategoryOrder, productOrder],
  );
  const q = searchKey(query);
  const sections = useMemo(() => {
    const matching = q
      ? products.filter((p) =>
          searchKey(
            `${p.name} ${p.category} ${p.subcategory || ""} ${p.barcode || ""}`,
          ).includes(q),
        )
      : products;
    const s = sectionsOf(matching, categoryOrder, subcategoryOrder, productOrder);
    return category ? s.filter((x) => x.name === category) : s;
  }, [products, q, category, categoryOrder, subcategoryOrder, productOrder]);

  const search = (
        <div className="relative">
          <Search className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="جستجوی کالا، دسته یا بارکد…"
            className="w-full pr-10 pl-9 py-2.5 text-[13px] rounded-2xl bg-white border border-sky-100 focus:border-sky-400 focus:ring-2 focus:ring-sky-100 outline-none shadow-sm"
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
  );

  const categories = all.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {[null, ...all.map((s) => s.name)].map((c) => (
            <button
              key={c ?? "all"}
              onClick={() => setCategory(c)}
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

  const list = (
    <div className="space-y-3">
      {sections.length === 0 ? (
        <div className="py-8 text-center text-xs text-slate-400">
          کالایی پیدا نشد.
        </div>
      ) : (
        sections.map((s) => (
          <section key={s.name} className="space-y-2">
            <h2 className="flex items-center gap-2 text-[13px] font-extrabold text-slate-800 pt-1">
              <span className="w-1 h-4 rounded-full bg-sky-500" />
              {s.name}
              <span className="text-[10px] font-normal text-slate-400">
                {num(s.count)} کالا
              </span>
            </h2>
            {s.groups.map((g) => (
              <div key={g.name || OTHER} className="space-y-1.5">
                {s.groups.length > 1 && g.name && (
                  <h3 className="text-[11px] font-bold text-slate-500 pr-3">
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
                    />
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))
      )}
    </div>
  );

  if (bare) return list;

  const blocks: Record<PosSectionId, React.ReactNode> = {
    tiers: slots.tiers,
    cart: slots.cart,
    search,
    categories,
    products: list,
  };
  return (
    <div className="space-y-3">
      {layout
        .filter((s) => s.visible || s.id === "products")
        .map((s) => blocks[s.id] ? <React.Fragment key={s.id}>{blocks[s.id]}</React.Fragment> : null)}
    </div>
  );
};
