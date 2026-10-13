import type { Product } from "../../services/products.service";
import { searchKey } from "../../lib/format";

const OTHER = "سایر";
const nameCollator = new Intl.Collator("fa");

export interface Section {
  name: string;
  groups: { name: string; products: Product[] }[];
  count: number;
}

const byName = (a: string, b: string) =>
  a === OTHER ? 1 : b === OTHER ? -1 : nameCollator.compare(a, b);

/** Category → sub-category sections. Named order first, then the rest by name. */
export const sectionsOf = (
  list: Product[],
  order: string[] = [],
  subOrder: Record<string, string[]> = {},
  prodOrder: string[] = [],
): Section[] => {
  const productRanks = new Map(prodOrder.map((id, index) => [id, index]));
  const categoryRanks = new Map(order.map((name, index) => [name, index]));
  const cats = new Map<string, Map<string, Product[]>>();
  for (const p of list) {
    const c = p.category || OTHER;
    const s = p.subcategory || "";
    const subs = cats.get(c) ?? new Map<string, Product[]>();
    const group = subs.get(s) ?? [];
    group.push(p);
    subs.set(s, group);
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
              const ia = productRanks.get(a._id) ?? -1;
              const ib = productRanks.get(b._id) ?? -1;
              if (ia !== -1 && ib !== -1) return ia - ib;
              if (ia !== -1) return -1;
              if (ib !== -1) return 1;
              return nameCollator.compare(a.name, b.name);
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
      const ia = categoryRanks.get(a.name) ?? -1;
      const ib = categoryRanks.get(b.name) ?? -1;
      if (ia === -1 && ib === -1) return byName(a.name, b.name);
      if (ia === -1) return 1;
      if (ib === -1) return -1;
      return ia - ib;
    });
};

export const productSearchIndex = (products: Product[]) => new Map(products.map((p) => [p._id,
  searchKey(`${p.name} ${p.category} ${p.subcategory || ""} ${p.barcode || ""}`),
]));

export function filterSections(all: Section[], searchable: Map<string, string>, query: string, category: string | null): Section[] {
  const selected = category ? all.filter((section) => section.name === category) : all;
  const q = searchKey(query);
  if (!q) return selected;
  return selected.map((section) => {
    const groups = section.groups.map((group) => ({
      ...group, products: group.products.filter((p) => searchable.get(p._id)?.includes(q)),
    })).filter((group) => group.products.length);
    return { ...section, groups, count: groups.reduce((sum, group) => sum + group.products.length, 0) };
  }).filter((section) => section.count);
}
