import {
  Injectable,
  OnApplicationBootstrap,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Invoice, InvoiceDocument } from './schemas/invoice.schema';
import { CreateInvoiceDto, InvoiceItemDto } from './dto/create-invoice.dto';
import { serverInvoiceTotals } from './server-totals';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { CustomersService } from '../customers/customers.service';
import { UsersService } from '../users/users.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { canonicalSupplier, isParentSupplier, PARENT_COMPANY, purchaseEntersShop, stockEntersShop } from '../suppliers/supplier-names';
import { goodsAmount, kgPerStock, landedUnitPrices, lineKg } from '../accounting/fifo';
import { Expense, ExpenseDocument } from '../expenses/schemas/expense.schema';
import { SettingsService } from '../settings/settings.service';
import { dayKey, priceOn, PricePeriodService, tehranDayStart, type PeriodRow } from '../pricing/price-period.service';
import { historicalSaleProfit } from '../rebuild/sale-profit';

interface ActingUser {
  id?: string;
  username?: string;
  fullName?: string;
}

@Injectable()
export class InvoicesService implements OnApplicationBootstrap {
  constructor(
    @InjectModel(Invoice.name)
    private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Product.name)
    private productModel: Model<ProductDocument>,
    @InjectModel(Customer.name)
    private customerModel: Model<CustomerDocument>,
    @InjectModel(Expense.name)
    private expenseModel: Model<ExpenseDocument>,
    private customersService: CustomersService,
    private usersService: UsersService,
    private suppliersService: SuppliersService,
    private settingsService: SettingsService,
    private pricePeriods: PricePeriodService,
  ) {}

  /** Shop purchases define the price of each date span. Factory shipments then use that span. */
  async onApplicationBootstrap() {
    await this.syncPricePeriods().catch(() => undefined);
    await this.rebuildStock().catch(() => undefined);
    await this.repairLandedBuyPrices().catch(() => undefined);
    await this.backfillRegisteredAt().catch(() => undefined);
  }

  /**
   * Older invoices have no registration stamp. Their creation time is the moment they were written,
   * so the list can order every invoice by registration without special cases.
   */
  private async backfillRegisteredAt() {
    await this.invoiceModel
      .updateMany({ registeredAt: { $exists: false } }, [
        { $set: { registeredAt: { $ifNull: ['$createdAt', '$invoiceDate'] } } },
      ])
      .exec();
    await this.invoiceModel
      .updateMany({ registeredAt: null }, [{ $set: { registeredAt: { $ifNull: ['$createdAt', '$invoiceDate'] } } }])
      .exec();
  }

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  /** A date-only string is that Tehran calendar day, not UTC midnight of the day before. */
  private invoiceInstant(input?: string | Date): Date {
    if (!input) return new Date();
    if (typeof input === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(input)) return new Date(`${input}T12:00:00+03:30`);
    return new Date(input);
  }

  private async syncPricePeriods() {
    await this.pricePeriods.rebuild();
  }

  private async nextInvoiceNumber(isSale: boolean): Promise<string> {
    const d = new Date();
    const stamp = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, '0')}${String(
      d.getDate(),
    ).padStart(2, '0')}`;
    const prefix = `${isSale ? 'SAL' : 'PUR'}-${stamp}-`;
    let n = (await this.invoiceModel.countDocuments({ invoiceNumber: { $regex: `^${prefix}` } })) + 1;
    // Deleted invoices leave gaps, so probe until a free number is found.
    while (await this.invoiceModel.exists({ invoiceNumber: `${prefix}${String(n).padStart(4, '0')}` })) {
      n++;
    }
    return `${prefix}${String(n).padStart(4, '0')}`;
  }

  /** Lines that actually sit in the shop. Unreceived purchase lines stay out of stock. */
  private inShop<T extends { received?: boolean }>(items: T[], purchase: boolean): T[] {
    return purchase ? items.filter((item) => item.received !== false) : items;
  }

  private withPurchasedProductIds(invoice: InvoiceDocument): InvoiceDocument {
    const obj = (typeof (invoice as any).toObject === 'function' ? (invoice as any).toObject() : invoice) as InvoiceDocument & {
      purchasedProductIds?: string[];
    };
    obj.purchasedProductIds = [
      ...new Set((obj.items || []).map((it) => String(it.productId || '')).filter((id) => Types.ObjectId.isValid(id))),
    ];
    return obj as InvoiceDocument;
  }

  /** Add `sign * quantity` of every item to stock. */
  private async shiftStock(items: { productId: string; quantity: number; received?: boolean }[], sign: 1 | -1, purchase = false) {
    for (const item of this.inShop(items, purchase)) {
      if (!Types.ObjectId.isValid(item.productId)) continue;
      await this.productModel
        .updateOne({ _id: item.productId }, { $inc: { stock: sign * (item.quantity || 0) } })
        .exec();
    }
  }

  /**
   * A purchase line typed by hand arrives with a temporary id ("custom-…"), which is not an ObjectId.
   * Create the product once (or reuse a same-named one) so the line gets a real product and stock.
   */
  private async resolvePurchasedProductId(item: InvoiceItemDto, supplierName?: string): Promise<string> {
    const name = item.productName.trim();
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const same = await this.productModel.findOne({ name: new RegExp(`^${escaped}$`, 'i') }).exec();
    if (same) {
      if (supplierName && !same.supplierName) {
        same.supplierName = canonicalSupplier(supplierName);
        await same.save();
      }
      return String(same._id);
    }

    const secondary = item.secondaryUnit || '';
    const hasDualUnit = Boolean(secondary) && Number(item.secondaryQuantity) > 0;
    const unitRatio = hasDualUnit && item.quantity > 0 ? Math.round((Number(item.secondaryQuantity) / item.quantity) * 100) / 100 : 1;
    const weightPerUnitKg = hasDualUnit && secondary === 'کیلوگرم' ? unitRatio : item.unit === 'کیلوگرم' ? 1 : 0;

    const buy = Math.round(Number(item.unitPrice) || 0);
    const product = await this.productModel.create({
      name,
      category: (item.newCategory || '').trim() || 'عمومی',
      subcategory: (item.newSubcategory || '').trim(),
      supplierName: supplierName ? canonicalSupplier(supplierName) : '',
      unit: item.unit || 'عدد',
      hasDualUnit,
      secondaryUnit: secondary || 'کیلوگرم',
      unitRatio,
      weightPerUnitKg,
      buyPrice: buy,
      sellPrice: buy,
      priceRetail: buy,
      stock: 0,
      openingStock: 0,
      minStockAlert: 5,
      isActive: true,
      priceHistory: [{ oldPrice: 0, newPrice: buy, reason: 'قیمت پایه از فاکتور خرید', changedByName: 'کاربر سیستم', date: new Date() }],
    });
    return String(product._id);
  }

  private async prepareItems(rawItems: InvoiceItemDto[], isSale: boolean, supplierName?: string) {
    let totalWeightKg = 0;
    const prepared: any[] = [];

    for (const raw of rawItems) {
      let item = raw;
      if (!isSale && !Types.ObjectId.isValid(raw.productId)) {
        item = { ...raw, productId: await this.resolvePurchasedProductId(raw, supplierName) };
      }
      const product = Types.ObjectId.isValid(item.productId)
        ? await this.productModel.findById(item.productId).exec()
        : null;
      if (!isSale && product && supplierName && !product.supplierName) {
        product.supplierName = canonicalSupplier(supplierName);
        await product.save();
      }
      if (!product) {
        if (isSale) throw new NotFoundException(`کالای «${item.productName}» یافت نشد.`);
        const weight = item.weightKg || item.secondaryQuantity || 0;
        totalWeightKg += weight;
        prepared.push({ ...item, weightKg: Math.round(weight * 10) / 10, received: item.received !== false });
        continue;
      }
      // Sales may take stock below zero (the shortfall is recorded, not rejected).
      const weight = lineKg(
        {
          productId: String(item.productId || ''),
          productName: item.productName,
          quantity: item.quantity,
          unit: item.unit,
          unitPrice: item.unitPrice,
          totalPrice: item.totalPrice || 0,
          weightKg: item.weightKg,
          secondaryQuantity: item.secondaryQuantity,
        },
        product ? { _id: String(product._id), name: product.name, unit: product.unit, weightPerUnitKg: product.weightPerUnitKg } : undefined,
      );
      totalWeightKg += weight;
      prepared.push({
        ...item,
        weightKg: Math.round(weight * 10) / 10,
        received: isSale ? true : item.received !== false,
        factoryUnitCost: Math.max(0, Math.round(Number(item.factoryUnitCost) || 0)),
        factoryCostConfirmed: item.factoryUnitCost !== undefined,
      });
    }

    return { items: prepared, totalWeightKg: Math.round(totalWeightKg * 10) / 10 };
  }

  /** How much of finalAmount goes on the customer's account (نسیه). */
  private creditPortion(dto: CreateInvoiceDto): number {
    if (dto.paymentMethod === 'credit') {
      return Math.max(0, dto.finalAmount - (dto.paidAmount || 0));
    }
    if (dto.paymentMethod === 'split') {
      return Math.max(0, Math.min(dto.finalAmount, dto.splitDetails?.credit || 0));
    }
    return 0;
  }

  /** Keep a deposit account only for the card methods that actually carry money on this invoice. */
  private depositAccounts(dto: CreateInvoiceDto) {
    const used = (m: 'pos' | 'transfer') =>
      dto.paymentMethod === m || (dto.paymentMethod === 'split' && (dto.splitDetails?.[m] || 0) > 0);
    return {
      pos: used('pos') ? dto.depositAccounts?.pos || '' : '',
      transfer: used('transfer') ? dto.depositAccounts?.transfer || '' : '',
    };
  }

  private async resolveCustomer(dto: CreateInvoiceDto) {
    if ((dto.type || 'sale') !== 'sale') return null;
    return this.customersService.findOrCreateForSale({
      customerId: dto.customerId,
      name: dto.customerName,
      phone: dto.customerPhone,
      saleType: dto.saleType,
    });
  }

  /** Empty when the customer has no branches. Required, and must match a defined branch, when they do. */
  private branchName(customer: { branches?: string[] } | null, raw?: string) {
    const branches = (customer?.branches || []).map((b) => String(b || '').trim()).filter(Boolean);
    const name = String(raw || '').trim();
    if (!branches.length) return '';
    if (!name) throw new BadRequestException('شعبه مشتری را انتخاب کنید');
    if (!branches.includes(name)) throw new BadRequestException('این شعبه برای مشتری تعریف نشده');
    return name;
  }

  /** On purchases only 'me' is meaningful: freight/unloading the shop pays, added to the landed cost. */
  private shippingFields(dto: CreateInvoiceDto, isSale: boolean) {
    const allowed = isSale || dto.shippingPayer === 'me';
    const payer = allowed && dto.shippingPayer && dto.shippingCost ? dto.shippingPayer : 'none';
    return { shippingPayer: payer, shippingCost: payer === 'none' ? 0 : Math.round(dto.shippingCost || 0) };
  }

  /** Keeps the shipping expense of an invoice in step with who pays for delivery. */
  private async syncShippingExpense(invoice: InvoiceDocument, recordedByName: string) {
    const isSale = invoice.type === 'sale';
    const onCompanyBooks = invoice.type === 'purchase' && !purchaseEntersShop(invoice) && invoice.fulfillment !== 'factory';
    const needed = !onCompanyBooks && invoice.shippingPayer === 'me' && invoice.shippingCost > 0;
    const existing = invoice.shippingExpenseId && Types.ObjectId.isValid(invoice.shippingExpenseId)
      ? await this.expenseModel.findById(invoice.shippingExpenseId).exec()
      : null;

    if (!needed) {
      if (existing) await existing.deleteOne();
      if (invoice.shippingExpenseId) {
        invoice.shippingExpenseId = undefined;
        await invoice.save();
      }
      return;
    }

    const fields = {
      type: 'shipping',
      categoryName: isSale ? 'ارسال بار و کرایه' : 'کرایه حمل خرید',
      amount: invoice.shippingCost,
      description: isSale
        ? `هزینه ارسال فاکتور ${invoice.invoiceNumber} — ${invoice.customerName}`
        : `کرایه حمل و تخلیه خرید ${invoice.invoiceNumber} — ${invoice.customerName} (جزو بهای تمام‌شده کالا)`,
      date: invoice.shippedAt || invoice.invoiceDate,
      isPersonalWithdrawal: false,
      paymentMethod: 'cash',
      recordedByName: recordedByName || 'مدیر سیستم',
      invoiceId: String(invoice._id),
      capitalized: !isSale,
    };
    if (existing) {
      existing.set(fields);
      await existing.save();
    } else {
      const created = await this.expenseModel.create(fields);
      invoice.shippingExpenseId = String(created._id);
      await invoice.save();
    }
  }

  private async assertFactoryEnabled() {
    const settings = await this.settingsService.get();
    if (!settings.factorySalesEnabled) {
      throw new BadRequestException('فروش از کارخانه در تنظیمات خاموش است');
    }
  }

  async factoryPrices(productIds?: string[]) {
    const filter: any = { isActive: true };
    if (productIds?.length) filter._id = { $in: productIds };
    const products = await this.productModel.find(filter)
      .select('name category unit weightPerUnitKg hasDualUnit secondaryUnit unitRatio factoryPrice').sort({ name: 1 }).lean().exec();
    const latest = await this.lastShopPurchasePrices(products.map((p) => String(p._id)));
    return products.map((p) => ({
      productId: String(p._id), name: p.name, category: p.category, unit: p.unit,
      weightPerUnitKg: p.weightPerUnitKg || (p.hasDualUnit && p.secondaryUnit === 'کیلوگرم' ? p.unitRatio : 0) || (p.unit === 'کیلوگرم' ? 1 : 0),
      lastPurchasePrice: latest[String(p._id)] ?? null,
      overridePrice: p.factoryPrice ?? null,
      price: p.factoryPrice ?? latest[String(p._id)] ?? null,
    }));
  }

  /** Latest line per product across all purchase invoices, including unreceived/factory purchases. */
  async lastShopPurchasePrices(productIds: string[]): Promise<Record<string, number>> {
    const wanted = [...new Set(productIds.map((id) => String(id || '')).filter(Boolean))];
    const found: Record<string, number> = {};
    if (!wanted.length) return found;
    const purchases = await this.invoiceModel
      .find({
        type: 'purchase',
        'items.productId': { $in: wanted },
      })
      .select('items.productId items.unitPrice items.received')
      .sort({ invoiceDate: -1, createdAt: -1, _id: -1 })
      .lean()
      .exec();
    const need = new Set(wanted);
    for (const inv of purchases) {
      for (const it of [...(inv.items || [])].reverse()) {
        const pid = String(it.productId || '');
        if (!need.has(pid)) continue;
        const price = Math.round(Number(it.unitPrice) || 0);
        if (!Number.isFinite(Number(it.unitPrice)) || price < 0) continue;
        found[pid] = price;
        need.delete(pid);
      }
      if (!need.size) break;
    }
    return found;
  }

  /** Companies, then one company's products with the purchase invoice that last set the buy price. */
  async priceBoard(company?: string) {
    const products = await this.productModel
      .find({ isActive: { $ne: false } })
      .select('name category unit supplierName weightPerUnitKg hasDualUnit secondaryUnit unitRatio buyPrice sellPrice priceRetail priceSupermarket priceWholesale agencyBasePrice agencyGap commissionAmount commissionUnit packageFee priceCostBasisPerKg')
      .sort({ name: 1 })
      .lean();
    const companyOf = (name?: string) => {
      const raw = String(name || '').trim();
      return raw ? canonicalSupplier(raw) : '';
    };
    const kgOf = (p: { weightPerUnitKg?: number; hasDualUnit?: boolean; secondaryUnit?: string; unitRatio?: number; unit?: string }) =>
      p.weightPerUnitKg || (p.hasDualUnit && p.secondaryUnit === 'کیلوگرم' ? p.unitRatio || 0 : 0) || (p.unit === 'کیلوگرم' ? 1 : 0);
    const ids = products.map((p) => String(p._id));
    const idSet = new Set(ids);
    const latest = new Map<string, { price: number; invoiceId: string; invoiceNumber: string; invoiceDate: Date }>();
    const shopPrice = new Set<string>();
    const boughtFrom = new Map<string, Set<string>>();
    if (ids.length) {
      const purchases = await this.invoiceModel
        .find({ type: 'purchase', 'items.productId': { $in: ids } })
        .select('invoiceNumber invoiceDate fulfillment shippingPayer shippingCost totalAmount discount customerName items createdAt')
        .sort({ invoiceDate: -1, createdAt: -1, _id: -1 })
        .lean();
      for (const inv of purchases) {
        const buyer = companyOf(inv.customerName);
        const prices = landedUnitPrices({
          type: 'purchase',
          shippingPayer: inv.shippingPayer,
          shippingCost: inv.shippingCost,
          totalAmount: inv.totalAmount,
          discount: inv.discount,
          items: inv.items || [],
        });
        const shop = inv.fulfillment !== 'factory';
        (inv.items || []).forEach((it, i) => {
          const pid = String(it.productId || '');
          if (!idSet.has(pid)) return;
          if (buyer) {
            const seen = boughtFrom.get(pid) || new Set<string>();
            seen.add(buyer);
            boughtFrom.set(pid, seen);
          }
          if (!(prices[i] > 0) || shopPrice.has(pid)) return;
          if (!shop && latest.has(pid)) return;
          latest.set(pid, {
            price: prices[i],
            invoiceId: String(inv._id),
            invoiceNumber: inv.invoiceNumber,
            invoiceDate: inv.invoiceDate,
          });
          if (shop) shopPrice.add(pid);
        });
      }
    }
    const names = new Set(await this.suppliersService.companyNames());
    for (const p of products) {
      const named = companyOf(p.supplierName);
      if (named) names.add(named);
      for (const buyer of boughtFrom.get(String(p._id)) || []) names.add(buyer);
    }
    const bare = (name: string) => name.replace(/^شرکت\s+/, '').trim();
    const official = new Map<string, string>();
    for (const name of names) {
      const key = bare(name);
      if (!key) continue;
      const prev = official.get(key);
      if (!prev || (name.startsWith('شرکت ') && !prev.startsWith('شرکت '))) official.set(key, name);
    }
    const fold = (name: string) => official.get(bare(name)) || name;
    const homeOf = (p: { _id: unknown; supplierName?: string }) => {
      const named = companyOf(p.supplierName);
      if (named) return fold(named);
      const buyers = [...(boughtFrom.get(String(p._id)) || [])];
      return buyers.length ? fold(buyers[0]) : 'سایر کالاها';
    };
    const companies = [...new Set([...names].filter(Boolean).map(fold))].sort((a, b) => a.localeCompare(b, 'fa'));
    const selected = String(company || '').trim();
    if (!selected) return { companies, company: '', products: [] as unknown[] };
    const wanted = fold(canonicalSupplier(selected));
    const list = products.filter((p) => {
      const id = String(p._id);
      if (homeOf(p) === wanted) return true;
      for (const buyer of boughtFrom.get(id) || []) if (fold(buyer) === wanted) return true;
      return false;
    });
    return {
      companies,
      company: wanted || selected,
      products: list.map((p) => {
        const id = String(p._id);
        const retail = Math.round(p.priceRetail || p.sellPrice || 0);
        return {
          productId: id,
          name: p.name,
          category: p.category || '',
          unit: p.unit,
          weightPerUnitKg: kgOf(p),
          buyPrice: Math.round(p.buyPrice || 0),
          lastPurchase: latest.get(id) || null,
          agencyBasePrice: Math.round(p.agencyBasePrice || 0),
          agencyGap: Math.round(p.agencyGap || 0),
          commissionAmount: Math.round(p.commissionAmount || 0),
          commissionUnit: p.commissionUnit === 'kg' ? 'kg' : 'unit',
          packageFee: Math.round(p.packageFee || 0),
          basePerKg: Math.round(p.priceCostBasisPerKg || 0),
          retail,
          supermarket: Math.round(p.priceSupermarket || retail),
          wholesale: Math.round(p.priceWholesale || retail),
        };
      }),
    };
  }

  /**
   * Profit of a sale, frozen on the invoice: goods after discount, minus the landed buy price
   * that was in force on the invoice date (or the factory price typed on that shipment).
   * Today's product.buyPrice is never used. A line with no cost that day contributes no profit.
   */
  private async stampSaleProfit(invoice: InvoiceDocument, known?: PeriodRow[]) {
    if (invoice.type !== 'sale') return;
    const ids = this.productIdsOf(invoice);
    const periods = known || await this.pricePeriods.forProducts(ids);
    const next = historicalSaleProfit(invoice, periods);
    let changed = invoice.costAmount !== next.costAmount || invoice.profitAmount !== next.profitAmount;
    (invoice.items || []).forEach((it, i) => {
      const line = next.lines[i];
      if (!line) return;
      if (it.unitCost !== line.unitCost || it.profit !== line.profit) changed = true;
      it.unitCost = line.unitCost;
      it.profit = line.profit;
    });
    if (!changed) return;
    invoice.costAmount = next.costAmount;
    invoice.profitAmount = next.profitAmount;
    invoice.markModified('items');
    await invoice.save();
  }

  private productIdsOf(invoice: { items?: { productId?: unknown }[] }) {
    return [...new Set((invoice.items || []).map((it) => String(it.productId || '')).filter((id) => Types.ObjectId.isValid(id)))];
  }

  /** Sales on or after this Tehran day pick up a purchase that was inserted, edited, or removed. */
  private async restampSalesFrom(productIds: string[], from?: Date) {
    const ids = [...new Set(productIds.filter((id) => Types.ObjectId.isValid(id)))];
    if (!ids.length) return;
    const filter: Record<string, unknown> = { type: 'sale', 'items.productId': { $in: ids } };
    if (from && !Number.isNaN(+new Date(from))) filter.invoiceDate = { $gte: tehranDayStart(from) };
    const sales = await this.invoiceModel.find(filter).exec();
    if (!sales.length) return;
    const periods = await this.pricePeriods.list();
    for (const sale of sales) await this.stampSaleProfit(sale, periods);
  }

  /** Landed buy price of each product on a Tehran day. Missing history is 0, never today's price. */
  async costOnDate(date: string, productIds: string[]) {
    const when = this.invoiceInstant(date);
    if (Number.isNaN(+when)) throw new BadRequestException('تاریخ نامعتبر است');
    const ids = [...new Set((productIds || []).filter((id) => Types.ObjectId.isValid(id)))];
    const periods = await this.pricePeriods.forProducts(ids);
    const costs: Record<string, number> = {};
    for (const id of ids) costs[id] = priceOn(periods, id, when);
    return { date: dayKey(when), costs };
  }

  listPricePeriods() {
    return this.pricePeriods.list();
  }

  /** A zero customer price on a factory sale becomes the factory cost plus that channel's percent. */
  private channelPercent(rule: { retailPercent?: number; supermarketPercent?: number; wholesalePercent?: number; distributorPercent?: number } | undefined, saleType?: string) {
    const raw = !rule ? 0
      : saleType === 'supermarket' ? rule.supermarketPercent
      : saleType === 'wholesale' ? rule.wholesalePercent
      : saleType === 'distributor' ? rule.distributorPercent
      : rule.retailPercent;
    return Math.min(1000, Math.max(0, Math.round(Number(raw) || 0)));
  }

  private arioUnit(product: { sellPrice?: number; priceRetail?: number; priceSupermarket?: number; priceWholesale?: number; priceDistributor?: number } | undefined, saleType?: string) {
    if (!product) return 0;
    const tier = saleType === 'supermarket' ? product.priceSupermarket
      : saleType === 'wholesale' ? product.priceWholesale
      : saleType === 'distributor' ? product.priceDistributor
      : product.priceRetail;
    return Math.round(Number(tier) || Number(product.sellPrice) || 0);
  }

  private async fillFactorySalePrices(items: { productId: any; quantity?: number; unitPrice?: number; totalPrice?: number; factoryUnitCost?: number }[], dto: CreateInvoiceDto) {
    const missing = items.filter((it) => !(Number(it.unitPrice) > 0));
    if (!missing.length) return;
    const ids = [...new Set(items.map((it) => it.productId).filter((id) => Types.ObjectId.isValid(String(id))))];
    const products = ids.length ? await this.productModel.find({ _id: { $in: ids } }).select('category sellPrice priceRetail priceSupermarket priceWholesale priceDistributor agencyBasePrice agencyGap').lean() : [];
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const asOf = dto.invoiceDate ? this.invoiceInstant(dto.invoiceDate) : new Date();
    const periods = await this.pricePeriods.forProducts(ids.map((id) => String(id)));
    let filled = false;
    for (const it of missing) {
      const product = byId.get(String(it.productId));
      const cost = Math.round(Number(it.factoryUnitCost) || priceOn(periods, String(it.productId), asOf) || 0);
      if (!(it.factoryUnitCost > 0) && cost > 0) it.factoryUnitCost = cost;
      const announced = Math.round(Number(product?.agencyBasePrice) || 0);
      const fromGap = cost > 0 ? cost + Math.round(Number(product?.agencyGap) || 0) : 0;
      const catalog = this.arioUnit(product, dto.saleType);
      const priced = announced > 0 ? announced : fromGap > 0 ? fromGap : catalog;
      if (!(priced > 0)) continue;
      it.unitPrice = priced;
      it.totalPrice = Math.round((it.quantity || 0) * priced);
      filled = true;
    }
    if (filled) {
      const goods = items.reduce((sum, it) => sum + (Number(it.totalPrice) || 0), 0);
      const discount = Math.max(0, Math.round(Number(dto.discount) || 0));
      const shipping = dto.shippingPayer === 'customer' ? Math.max(0, Math.round(Number(dto.shippingCost) || 0)) : 0;
      dto.totalAmount = goods;
      dto.finalAmount = Math.max(0, goods - discount) + shipping;
    }
  }

  /**
   * Direct factory sale: the parent company invoiced Ario, the goods never entered the shop,
   * and the customer invoice is what Ario sends. Stock is untouched on both sides.
   */
  private async attachFactoryPurchase(sale: InvoiceDocument, recordedByName: string) {
    const periods = await this.pricePeriods.forProducts(this.productIdsOf(sale));
    const items = [];
    for (const it of sale.items || []) {
      let unitPrice = Math.max(0, Math.round(it.factoryUnitCost || 0));
      if (!unitPrice) unitPrice = priceOn(periods, String(it.productId || ''), sale.invoiceDate || new Date());
      items.push({
        productId: it.productId,
        productName: it.productName,
        quantity: it.quantity,
        unit: it.unit,
        secondaryQuantity: it.secondaryQuantity,
        secondaryUnit: it.secondaryUnit,
        unitPrice,
        totalPrice: Math.round((it.quantity || 0) * unitPrice),
        weightKg: it.weightKg || 0,
        received: true,
      });
    }
    sale.markModified('items');
    const total = items.reduce((s, it) => s + it.totalPrice, 0);
    const fields = {
      type: 'purchase',
      saleType: 'wholesale',
      customerName: canonicalSupplier(sale.supplierCompany || PARENT_COMPANY),
      endCustomerName: sale.customerName || '',
      customerPhone: '',
      invoiceDate: sale.invoiceDate,
      items,
      totalAmount: total,
      discount: 0,
      finalAmount: total,
      totalWeightKg: sale.totalWeightKg || 0,
      paymentMethod: 'credit',
      splitDetails: {},
      creditAmount: total,
      creditApplied: 0,
      creditSurplus: 0,
      paidAmount: 0,
      remainingDebt: total,
      isPaid: total <= 0,
      fulfillment: 'factory',
      factorySaleId: String(sale._id),
      shippingPayer: 'none',
      shippingCost: 0,
      notes: `ارسال مستقیم از کارخانه برای ${sale.customerName || 'مشتری'}، فاکتور ${sale.invoiceNumber}. از موجودی آریو کم نشده.`,
      createdByName: recordedByName || sale.createdByName || 'مدیر سیستم',
    };

    let purchase = sale.factoryPurchaseId && Types.ObjectId.isValid(sale.factoryPurchaseId)
      ? await this.invoiceModel.findById(sale.factoryPurchaseId).exec()
      : null;
    if (purchase && String(purchase.factorySaleId || '') !== String(sale._id)) purchase = null;
    if (!purchase) {
      purchase = new this.invoiceModel({ ...fields, invoiceNumber: await this.nextInvoiceNumber(false) });
    } else {
      purchase.set(fields);
    }
    await purchase.save();
    sale.factoryPurchaseId = String(purchase._id);
    sale.factoryPurchaseNumber = purchase.invoiceNumber;
    await sale.save();
    await this.suppliersService.sync(canonicalSupplier(sale.supplierCompany || PARENT_COMPANY));
  }

  async repairFactoryPurchasePrices(): Promise<number> {
    return 0;
  }

  private async detachFactoryPurchase(sale: InvoiceDocument) {
    const id = sale.factoryPurchaseId;
    if (id && Types.ObjectId.isValid(id)) {
      const purchase = await this.invoiceModel.findById(id).exec();
      if (purchase && String(purchase.factorySaleId || '') === String(sale._id)) {
        await purchase.deleteOne();
        await this.suppliersService.sync(purchase.customerName || PARENT_COMPANY);
      }
    }
    if (sale.factoryPurchaseId || sale.factoryPurchaseNumber) {
      sale.factoryPurchaseId = '';
      sale.factoryPurchaseNumber = '';
      await sale.save();
    }
  }

  /** A price typed on the company purchase becomes the hidden cost of the customer sale. */
  private async mirrorFactoryCostToSale(purchase: InvoiceDocument) {
    if (!purchase.factorySaleId || !Types.ObjectId.isValid(purchase.factorySaleId)) return;
    const sale = await this.invoiceModel.findById(purchase.factorySaleId).exec();
    if (!sale || sale.type !== 'sale') return;
    sale.items.forEach((it, i) => {
      const src = purchase.items[i];
      // A later edit of the company purchase must not replace the price that was frozen on the sale.
      if (src && String(src.productId) === String(it.productId) && !(Number(it.factoryUnitCost) > 0)) {
        it.factoryUnitCost = Math.max(0, Math.round(src.unitPrice || 0));
      }
    });
    sale.markModified('items');
    await sale.save();
    await this.attachFactoryPurchase(sale, purchase.createdByName || '');
  }

  /** 403, not 401: the client treats 401 as an expired session and logs the user out. */
  private async verifyPassword(user: ActingUser, password?: string, purpose = 'حذف') {
    if (!password) throw new ForbiddenException(`برای ${purpose}، رمز عبور خود را وارد کنید`);
    const account = user.username ? await this.usersService.findByUsername(user.username) : null;
    if (!account || !(await bcrypt.compare(password, account.password))) {
      throw new ForbiddenException('رمز عبور اشتباه است');
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  /**
   * One invoice per company. A cart with sugar, tea and nabat becomes three invoices,
   * each with its own lines, and each sits on that company's account.
   */
  private async divideByCompany(dto: CreateInvoiceDto): Promise<{ company: string; dto: CreateInvoiceDto }[]> {
    const isSale = (dto.type || 'sale') === 'sale';
    const fallback = isSale ? PARENT_COMPANY : canonicalSupplier(dto.customerName || PARENT_COMPANY);
    const ids = [...new Set((dto.items || []).map((it) => it.productId).filter((id) => Types.ObjectId.isValid(id)))];
    const products = ids.length ? await this.productModel.find({ _id: { $in: ids } }).select('supplierName').lean() : [];
    const named = new Map(products.map((p) => [String(p._id), (p.supplierName || '').trim()]));
    const companyOf = (productId: string) => {
      const raw = named.get(productId);
      return raw ? canonicalSupplier(raw) : fallback;
    };
    const groups = new Map<string, CreateInvoiceDto['items']>();
    for (const it of dto.items || []) {
      const company = companyOf(it.productId);
      const list = groups.get(company) ?? [];
      list.push(it);
      groups.set(company, list);
    }
    const entries = [...groups.entries()];
    if (entries.length <= 1) {
      const company = entries[0]?.[0] || fallback;
      return [{ company, dto: { ...dto, customerName: isSale ? dto.customerName : company } }];
    }

    const lineSum = (items: CreateInvoiceDto['items']) => items.reduce((s, it) => s + (Number(it.totalPrice) || 0), 0);
    const all = lineSum(dto.items);
    let discountLeft = Math.round(dto.discount || 0);
    let shippingLeft = Math.round(dto.shippingCost || 0);
    let paidLeft = Math.round(dto.paidAmount || 0);
    const splitLeft = {
      pos: Math.round(dto.splitDetails?.pos || 0),
      cash: Math.round(dto.splitDetails?.cash || 0),
      transfer: Math.round(dto.splitDetails?.transfer || 0),
      cheque: Math.round(dto.splitDetails?.cheque || 0),
      credit: Math.round(dto.splitDetails?.credit || 0),
    };
    const portion = (total: number, left: number, last: boolean, share: number) => {
      if (last) return left;
      return Math.min(left, Math.round(total * share));
    };

    return entries.map(([company, items], index) => {
      const last = index === entries.length - 1;
      const share = all > 0 ? lineSum(items) / all : 1 / entries.length;
      const discount = portion(dto.discount || 0, discountLeft, last, share);
      discountLeft -= discount;
      const shippingCost = portion(dto.shippingCost || 0, shippingLeft, last, share);
      shippingLeft -= shippingCost;
      const totalAmount = Math.round(lineSum(items));
      const finalAmount = Math.max(0, totalAmount - discount);
      let splitDetails = dto.splitDetails;
      let paidAmount = dto.paidAmount;
      if (dto.paymentMethod === 'split') {
        const next = {
          pos: portion(dto.splitDetails?.pos || 0, splitLeft.pos, last, share),
          cash: portion(dto.splitDetails?.cash || 0, splitLeft.cash, last, share),
          transfer: portion(dto.splitDetails?.transfer || 0, splitLeft.transfer, last, share),
          cheque: portion(dto.splitDetails?.cheque || 0, splitLeft.cheque, last, share),
          credit: portion(dto.splitDetails?.credit || 0, splitLeft.credit, last, share),
        };
        splitLeft.pos -= next.pos;
        splitLeft.cash -= next.cash;
        splitLeft.transfer -= next.transfer;
        splitLeft.cheque -= next.cheque;
        splitLeft.credit -= next.credit;
        splitDetails = next;
        paidAmount = Math.max(0, finalAmount - next.credit);
      } else if (dto.paymentMethod === 'credit') {
        paidAmount = portion(dto.paidAmount || 0, paidLeft, last, share);
        paidLeft -= paidAmount;
      } else {
        paidAmount = finalAmount;
      }
      const weight = items.reduce((s, it) => s + (Number(it.weightKg) || 0), 0);
      return {
        company,
        dto: {
          ...dto,
          items,
          customerName: isSale ? dto.customerName : company,
          totalAmount,
          discount,
          finalAmount,
          totalWeightKg: Math.round(weight * 10) / 10,
          shippingCost,
          splitDetails,
          paidAmount,
        },
      };
    });
  }

  /**
   * Money is computed here, never trusted from the client: goods total = Σ quantity × unit price,
   * final = max(0, goods − discount) + shipping paid by the customer (same rule as the sale screen).
   */
  private withServerTotals(dto: CreateInvoiceDto): CreateInvoiceDto {
    return serverInvoiceTotals(dto);
  }

  async create(
    rawDto: CreateInvoiceDto,
    recordedByName: string,
    extra: { proformaNumber?: string; shippedAt?: Date; proformaDate?: Date } = {},
    companyName?: string,
  ): Promise<InvoiceDocument> {
    const dto = this.withServerTotals(rawDto);
    if (!companyName) {
      const parts = await this.divideByCompany(dto);
      if (parts.length > 1) {
        const made: InvoiceDocument[] = [];
        for (const part of parts) made.push(await this.create(part.dto, recordedByName, extra, part.company));
        const productIds = [...new Set(made.flatMap((inv) => (inv.items || []).map((it) => String(it.productId))).filter((id) => Types.ObjectId.isValid(id)))];
        const categories = new Map(
          (productIds.length ? await this.productModel.find({ _id: { $in: productIds } }).select('category').lean() : []).map((p) => [String(p._id), p.category || '']),
        );
        const orderBundle = {
          id: crypto.randomUUID(),
          invoices: made.map((inv) => ({
            invoiceId: String(inv._id),
            invoiceNumber: inv.invoiceNumber,
            supplierCompany: inv.supplierCompany || '',
            finalAmount: inv.finalAmount,
            items: (inv.items || []).map((it) => ({
              productName: it.productName,
              category: categories.get(String(it.productId)) || '',
              quantity: it.quantity,
              unit: it.unit,
              totalPrice: it.totalPrice,
            })),
          })),
        };
        await this.invoiceModel.updateMany({ _id: { $in: made.map((inv) => inv._id) } }, { $set: { orderBundle } });
        const first = made[0].toObject() as InvoiceDocument & { splitInto?: unknown[]; orderBundle?: unknown };
        first.orderBundle = orderBundle;
        (first as any).purchasedProductIds = productIds;
        first.splitInto = made.map((inv) => ({
          _id: String(inv._id),
          invoiceNumber: inv.invoiceNumber,
          supplierCompany: inv.supplierCompany,
          finalAmount: inv.finalAmount,
          type: inv.type,
        }));
        return first as InvoiceDocument;
      }
      return this.create(parts[0].dto, recordedByName, extra, parts[0].company);
    }

    const isSale = (dto.type || 'sale') === 'sale';
    const fromFactory = isSale && dto.fulfillment === 'factory';
    if (fromFactory) await this.assertFactoryEnabled();
    const { items, totalWeightKg } = await this.prepareItems(dto.items, isSale && !fromFactory, isSale ? undefined : dto.customerName);
    if (fromFactory) {
      for (const it of items) it.factoryCostConfirmed = true;
      await this.fillFactorySalePrices(items, dto);
    }
    const customer = isSale ? await this.resolveCustomer(dto) : null;
    const branchName = this.branchName(customer, dto.branchName);
    // Purchases on credit go on the supplier's account (see SuppliersService).
    const credit = this.creditPortion(dto);

    if (isSale && credit > 0 && !customer) {
      throw new BadRequestException('برای فروش نسیه، مشتری را انتخاب کنید');
    }

    if (isSale && !fromFactory) {
      await this.shiftStock(items, -1);
    } else if (!isSale) {
      // Every received purchase adds stock, whichever company it came from.
      await this.shiftStock(items, 1, true);
      await this.rememberLandedBuyPrices(items, dto, this.invoiceInstant(dto.invoiceDate));
    }

    const customerPrevBalance = customer?.balance || 0;
    const invoiceDate = dto.invoiceDate ? this.invoiceInstant(dto.invoiceDate) : new Date();
    const dueDays = credit > 0 ? Math.min(365, Math.max(0, Math.round(dto.dueDays ?? 15))) : 15;
    const invoice = new this.invoiceModel({
      invoiceNumber: await this.nextInvoiceNumber(isSale),
      type: dto.type || 'sale',
      saleType: dto.saleType || 'retail',
      customerId: customer ? customer._id : undefined,
      customerName: customer?.name || (isSale ? dto.customerName : canonicalSupplier(dto.customerName)),
      supplierCompany: companyName,
      customerPhone: customer?.phoneNumber || dto.customerPhone || '',
      branchName,
      invoiceDate,
      items,
      totalAmount: dto.totalAmount,
      discount: dto.discount || 0,
      finalAmount: dto.finalAmount,
      totalWeightKg,
      paymentMethod: dto.paymentMethod || 'pos',
      splitDetails: dto.splitDetails || {},
      depositAccounts: this.depositAccounts(dto),
      creditAmount: credit,
      creditApplied: 0,
      creditSurplus: 0,
      dueDays,
      dueDate: credit > 0 ? new Date(invoiceDate.getTime() + dueDays * 86400000) : undefined,
      fulfillment: fromFactory ? 'factory' : 'shop',
      paidAmount: dto.finalAmount - credit,
      remainingDebt: credit,
      isPaid: credit === 0,
      customerPrevBalance,
      customerNewBalance: customerPrevBalance + credit,
      notes: dto.notes || '',
      ...this.shippingFields(dto, isSale),
      proformaNumber: extra.proformaNumber || '',
      proformaDate: extra.proformaDate || (isSale ? invoiceDate : undefined),
      shippedAt: extra.shippedAt || (isSale ? invoiceDate : undefined),
      paidAt: isSale && dto.finalAmount - credit > 0 ? invoiceDate : undefined,
      registeredAt: new Date(),
      createdByName: recordedByName || 'مدیر سیستم',
    });
    await invoice.save();
    await this.syncShippingExpense(invoice, recordedByName);
    if (fromFactory) await this.attachFactoryPurchase(invoice, recordedByName);

    if (isSale && customer) {
      await this.customersService.touchSale(String(customer._id), invoiceDate);
      if (credit > 0) {
        invoice.customerNewBalance = await this.customersService.addInvoiceDebt(invoice, recordedByName);
        await invoice.save();
        await this.customersService.alignInvoiceDebts(String(customer._id));
        await this.stampSaleProfit(invoice);
        return this.findById(String(invoice._id));
      }
    }
    if (!isSale) {
      await this.suppliersService.sync(invoice.customerName);
      if (purchaseEntersShop(invoice)) {
        await this.syncPricePeriods();
        await this.restampSalesFrom(this.productIdsOf(invoice), invoice.invoiceDate);
      }
      return this.withPurchasedProductIds(await this.findById(String(invoice._id)));
    }
    await this.stampSaleProfit(invoice);
    return invoice;
  }

  async update(id: string, dto: CreateInvoiceDto, recordedByName: string, user?: ActingUser, password?: string): Promise<InvoiceDocument> {
    await this.verifyPassword(user || {}, password, 'ویرایش فاکتور و تغییر موجودی');
    const invoice = await this.findById(id);
    const isSale = invoice.type === 'sale';
    const wasFactory = invoice.fulfillment === 'factory';
    const willFactory = (dto.fulfillment ?? invoice.fulfillment) === 'factory';
    const nextSupplier = isSale ? invoice.customerName : canonicalSupplier(dto.customerName || invoice.customerName);
    const wasShopSale = isSale && !wasFactory;
    const wasShopPurchase = !isSale && stockEntersShop(invoice) && !wasFactory;
    const willShopSale = isSale && !willFactory;
    const willShopPurchase = !isSale && !wasFactory && !willFactory;
    if (isSale && willFactory && !wasFactory) await this.assertFactoryEnabled();

    // Undo the old effects, then apply the new ones; restore on validation failure.
    if (wasShopSale) await this.shiftStock(invoice.items as any, 1);
    else if (wasShopPurchase) await this.shiftStock(invoice.items as any, -1, true);
    let prepared: Awaited<ReturnType<InvoicesService['prepareItems']>>;
    try {
      prepared = await this.prepareItems(dto.items, willShopSale, isSale ? undefined : dto.customerName);
    } catch (err) {
      if (wasShopSale) await this.shiftStock(invoice.items as any, -1);
      else if (wasShopPurchase) await this.shiftStock(invoice.items as any, 1, true);
      throw err;
    }
    if (willShopSale) await this.shiftStock(prepared.items, -1);
    else if (willShopPurchase) await this.shiftStock(prepared.items, 1, true);
    if (willFactory && isSale) {
      for (const it of prepared.items) it.factoryCostConfirmed = true;
      await this.fillFactorySalePrices(prepared.items, dto);
    }

    const customer = isSale ? await this.resolveCustomer(dto) : null;
    const branchName = this.branchName(customer, dto.branchName ?? invoice.branchName);
    let credit = this.creditPortion(dto);
    if (isSale) {
      const paidLater = await this.customersService.getPaidLater(invoice._id);
      const splitPaid =
        (dto.splitDetails?.pos || 0) +
        (dto.splitDetails?.cash || 0) +
        (dto.splitDetails?.transfer || 0) +
        (dto.splitDetails?.cheque || 0);
      const gap = Math.max(0, (dto.finalAmount || 0) - credit);
      if (gap > 0 && splitPaid <= 0 && paidLater + 1 >= gap) credit = dto.finalAmount || credit;
    }
    if (isSale && credit > 0 && !customer) {
      if (willShopSale) await this.shiftStock(prepared.items, 1);
      if (wasShopSale) await this.shiftStock(invoice.items as any, -1);
      else if (wasShopPurchase) await this.shiftStock(invoice.items as any, 1, true);
      throw new BadRequestException('برای فروش نسیه، مشتری را انتخاب کنید');
    }

    if (isSale) {
      const customerChanged = String(invoice.customerId || '') !== String(customer?._id || '');
      await this.customersService.removeInvoiceDebt(invoice, customerChanged);
    }

    const previousSupplier = invoice.customerName;
    const previousDate = invoice.invoiceDate;
    const previousProductIds = this.productIdsOf(invoice);
    const invoiceDate = dto.invoiceDate ? this.invoiceInstant(dto.invoiceDate) : invoice.invoiceDate;
    const dueDays = credit > 0 ? Math.min(365, Math.max(0, Math.round(dto.dueDays ?? invoice.dueDays ?? 15))) : invoice.dueDays;
    invoice.set({
      saleType: dto.saleType || invoice.saleType,
      customerId: customer ? customer._id : undefined,
      customerName: customer?.name || (isSale ? dto.customerName : dto.customerName && canonicalSupplier(dto.customerName)) || invoice.customerName,
      customerPhone: customer?.phoneNumber || dto.customerPhone || '',
      branchName,
      invoiceDate,
      fulfillment: isSale ? (willFactory ? 'factory' : 'shop') : wasFactory ? 'factory' : willShopPurchase ? 'shop' : 'ledger',
      ...(typeof dueDays === 'number' ? { dueDays } : {}),
      ...(credit > 0 ? { dueDate: new Date(new Date(invoiceDate).getTime() + (dueDays || 15) * 86400000) } : {}),
      items: prepared.items,
      totalAmount: dto.totalAmount,
      discount: dto.discount || 0,
      finalAmount: dto.finalAmount,
      totalWeightKg: prepared.totalWeightKg,
      paymentMethod: dto.paymentMethod || invoice.paymentMethod,
      splitDetails: dto.splitDetails || {},
      ...(dto.depositAccounts !== undefined
        ? { depositAccounts: this.depositAccounts({ ...dto, paymentMethod: dto.paymentMethod || invoice.paymentMethod }) }
        : {}),
      creditAmount: credit,
      notes: dto.notes ?? invoice.notes,
      ...(dto.shippingPayer !== undefined ? this.shippingFields(dto, isSale) : {}),
      ...(isSale && !invoice.shippedAt ? { shippedAt: invoiceDate } : {}),
      ...(isSale && (dto.finalAmount || 0) - credit > 0 && !invoice.paidAt ? { paidAt: invoiceDate } : {}),
    });
    await invoice.save();
    await this.syncShippingExpense(invoice, recordedByName);
    if (isSale && willFactory) await this.attachFactoryPurchase(invoice, recordedByName);
    else if (isSale && wasFactory) await this.detachFactoryPurchase(invoice);
    if (isSale && customer) await this.customersService.touchSale(String(customer._id), invoiceDate);

    if (!isSale) {
      if (invoice.fulfillment === 'factory' && invoice.factorySaleId) {
        await this.mirrorFactoryCostToSale(invoice);
      }
      if (willShopPurchase) await this.rememberLandedBuyPrices(prepared.items, invoice, invoiceDate);
      await this.suppliersService.sync(invoice.customerName);
      if (canonicalSupplier(previousSupplier) !== canonicalSupplier(invoice.customerName)) {
        await this.suppliersService.sync(previousSupplier);
      }
      if (wasShopPurchase || willShopPurchase) {
        await this.syncPricePeriods();
        const from = [previousDate, invoiceDate].filter((d) => d && !Number.isNaN(+new Date(d))).sort((a, b) => +new Date(a) - +new Date(b))[0];
        await this.restampSalesFrom([...previousProductIds, ...this.productIdsOf(invoice)], from);
      }
      return this.withPurchasedProductIds(await this.findById(id));
    }
    if (credit > 0 && customer) {
      invoice.customerNewBalance = await this.customersService.addInvoiceDebt(invoice, recordedByName);
      await invoice.save();
    }
    if (customer) await this.customersService.alignInvoiceDebts(String(customer._id));
    await this.stampSaleProfit(invoice);
    return this.findById(id);
  }

  async remove(id: string, user: ActingUser, password?: string): Promise<{ message: string }> {
    await this.verifyPassword(user, password);
    const invoice = await this.findById(id);
    const isSale = invoice.type === 'sale';
    const fromFactory = invoice.fulfillment === 'factory';
    const shopPurchase = purchaseEntersShop(invoice);
    const removedProductIds = this.productIdsOf(invoice);
    const removedDate = invoice.invoiceDate;

    if (isSale && fromFactory) await this.detachFactoryPurchase(invoice);
    else if (!isSale && invoice.factorySaleId && Types.ObjectId.isValid(invoice.factorySaleId)) {
      await this.invoiceModel.updateOne({ _id: invoice.factorySaleId }, { $set: { factoryPurchaseId: '', factoryPurchaseNumber: '' } }).exec();
    }

    if (isSale && !fromFactory) await this.shiftStock(invoice.items as any, 1);
    else if (stockEntersShop(invoice) && !fromFactory) await this.shiftStock(invoice.items as any, -1, true);
    if (invoice.shippingExpenseId && Types.ObjectId.isValid(invoice.shippingExpenseId)) {
      await this.expenseModel.deleteOne({ _id: invoice.shippingExpenseId }).exec();
    }
    await invoice.deleteOne();
    if (isSale) {
      await this.customersService.removeInvoiceDebt(invoice, true);
      if (invoice.customerId) await this.customersService.alignInvoiceDebts(String(invoice.customerId));
    } else {
      await this.suppliersService.sync(invoice.customerName);
      if (shopPurchase) {
        await this.syncPricePeriods();
        await this.restampSalesFrom(removedProductIds, removedDate);
      }
    }
    return { message: `فاکتور ${invoice.invoiceNumber} حذف شد` };
  }

  async addPayment(
    id: string,
    body: { amount: number; paymentMethod?: any; description?: string; date?: string; accountId?: string },
    recordedByName: string,
  ) {
    const accountId = body.paymentMethod === 'transfer' ? String(body.accountId || '') : '';
    const invoice = await this.findById(id);
    if (invoice.type === 'purchase') {
      if (!body.amount || body.amount <= 0) throw new BadRequestException('مبلغ نامعتبر است');
      // Supplier payments settle the oldest open purchase first.
      await this.suppliersService.createPayment(
        {
          supplier: invoice.customerName,
          amount: body.amount,
          date: body.date || new Date().toISOString(),
          method: body.paymentMethod,
          notes: body.description || `پرداخت از فاکتور ${invoice.invoiceNumber}`,
        },
        recordedByName,
      );
      return this.findById(id);
    }
    if (invoice.type !== 'sale') {
      throw new BadRequestException('ثبت پرداخت فقط برای فاکتور فروش ممکن است');
    }
    if (!body.amount || body.amount <= 0) {
      throw new BadRequestException('مبلغ نامعتبر است');
    }
    if (!invoice.customerId) {
      // Walk-in credit invoice: no customer ledger, the payment lives on the invoice itself.
      if (body.amount > (invoice.remainingDebt || 0)) {
        throw new BadRequestException('مبلغ از مانده فاکتور بیشتر است');
      }
      invoice.legacyPayments.push({
        date: body.date ? new Date(body.date) : new Date(),
        amount: body.amount,
        method: body.paymentMethod,
        accountId,
      });
      invoice.paidAmount = Math.min(invoice.finalAmount, (invoice.paidAmount || 0) + body.amount);
      invoice.remainingDebt = Math.max(0, invoice.finalAmount - invoice.paidAmount);
      invoice.isPaid = invoice.remainingDebt === 0;
      invoice.paidAt = body.date ? new Date(body.date) : new Date();
      if (!invoice.shippedAt) invoice.shippedAt = invoice.paidAt;
      invoice.markModified('legacyPayments');
      await invoice.save();
      return invoice;
    }
    await this.customersService.recordTransaction(
      String(invoice.customerId),
      {
        type: 'payment',
        amount: body.amount,
        paymentMethod: body.paymentMethod,
        description: body.description,
        invoiceId: id,
        date: body.date,
        accountId,
      },
      recordedByName,
    );
    const updated = await this.findById(id);
    updated.paidAt = body.date ? new Date(body.date) : new Date();
    if (!updated.shippedAt) updated.shippedAt = updated.paidAt;
    await updated.save();
    return updated;
  }

  /**
   * Purchases already saved stored the supplier unit price and left the freight out.
   * Where the product price is still that unit price, replace it with the landed cost of the latest purchase.
   */
  private async repairLandedBuyPrices() {
    const purchases = await this.invoiceModel
      .find({ type: 'purchase', fulfillment: { $ne: 'factory' } })
      .select('invoiceDate shippingPayer shippingCost totalAmount discount items')
      .sort({ invoiceDate: 1, createdAt: 1 })
      .lean();
    const latest = new Map<string, { unit: number; landed: number }>();
    for (const inv of purchases) {
      const items = inv.items || [];
      const prices = landedUnitPrices({
        type: 'purchase',
        shippingPayer: inv.shippingPayer,
        shippingCost: inv.shippingCost,
        totalAmount: inv.totalAmount,
        discount: inv.discount,
        items,
      });
      items.forEach((it, i) => {
        const id = String(it.productId || '');
        if (!Types.ObjectId.isValid(id) || !(it.unitPrice > 0) || !(prices[i] > 0)) return;
        latest.set(id, { unit: Math.round(it.unitPrice), landed: prices[i] });
      });
    }
    for (const [id, row] of latest) {
      if (row.landed === row.unit) continue;
      await this.productModel.updateOne({ _id: id, buyPrice: row.unit }, { $set: { buyPrice: row.landed } }).exec();
    }
  }

  /**
   * Writes each line's landed unit cost (invoice price after discount + its share of freight)
   * onto the product. The invoice line keeps the supplier's unit price.
   */
  private async rememberLandedBuyPrices(
    items: { productId: unknown; quantity: number; unit?: string; unitPrice: number; totalPrice?: number; weightKg?: number; secondaryQuantity?: number; productName?: string }[],
    money: { shippingPayer?: string | null; shippingCost?: number; totalAmount?: number; discount?: number },
    invoiceDate: Date,
  ) {
    const prices = landedUnitPrices({
      type: 'purchase',
      shippingPayer: money.shippingPayer || undefined,
      shippingCost: money.shippingCost,
      totalAmount: money.totalAmount || 0,
      discount: money.discount,
      items: items.map((it) => ({
        productId: String(it.productId || ''),
        productName: it.productName || '',
        quantity: it.quantity,
        unit: it.unit || '',
        unitPrice: it.unitPrice,
        totalPrice: it.totalPrice || 0,
        weightKg: it.weightKg,
        secondaryQuantity: it.secondaryQuantity,
      })),
    });
    for (let i = 0; i < items.length; i++) {
      if (prices[i] > 0) await this.rememberBuyPrice(items[i].productId, prices[i], invoiceDate);
    }
  }

  /** A backdated purchase must not overwrite the buy price set by a newer invoice. */
  private async rememberBuyPrice(productId: unknown, unitPrice: number, invoiceDate: Date) {
    const id = String(productId || '');
    if (!(unitPrice > 0) || !Types.ObjectId.isValid(id)) return;
    const later = await this.invoiceModel.exists({
      type: 'purchase',
      fulfillment: { $ne: 'factory' },
      invoiceDate: { $gt: invoiceDate },
      items: { $elemMatch: { productId: id, unitPrice: { $gt: 0 } } },
    });
    if (later) return;
    const landed = Math.round(unitPrice);
    const product = await this.productModel.findById(id).select('buyPrice sellPrice priceRetail priceSupermarket priceWholesale priceDistributor agencyGap').lean();
    const prev = Math.round(Number(product?.buyPrice) || 0);
    const gap = Math.round(Number(product?.agencyGap) || 0);
    const set: Record<string, number | Date> = { buyPrice: landed };
    if (gap > 0) set.agencyBasePrice = landed + gap;
    const history: { oldPrice: number; newPrice: number; reason: string; changedByName: string; date: Date }[] = [];
    if (prev > 0 && landed > prev) {
      const lift = (n: number) => {
        const raw = (Number(n) || 0) * (landed / prev);
        if (!(raw > 0)) return 0;
        if (raw < 500) return Math.round(raw);
        return Math.round(raw / 500) * 500;
      };
      const oldRetail = Math.round(Number(product?.priceRetail) || Number(product?.sellPrice) || 0);
      const retail = lift(oldRetail);
      if (retail > 0) {
        set.sellPrice = retail;
        set.priceRetail = retail;
        set.priceSupermarket = lift(product?.priceSupermarket || oldRetail);
        set.priceWholesale = lift(product?.priceWholesale || oldRetail);
        set.priceDistributor = lift(product?.priceDistributor || product?.priceWholesale || oldRetail);
        set.priceSetAt = new Date();
        history.push({
          oldPrice: oldRetail,
          newPrice: retail,
          reason: 'خرید گران‌تر شد و همان درصد سود روی قیمت جدید نشست',
          changedByName: 'سیستم',
          date: new Date(),
        });
      }
    }
    await this.productModel.updateOne(
      { _id: id },
      { $set: set, ...(history.length ? { $push: { priceHistory: { $each: history, $position: 0, $slice: 40 } } } : {}) },
    ).exec();
  }

  async setDueDays(id: string, days: number): Promise<InvoiceDocument> {
    const invoice = await this.findById(id);
    if (invoice.type !== 'sale' || !(invoice.creditAmount > 0)) {
      throw new BadRequestException('سررسید فقط برای فاکتور نسیه است');
    }
    const dueDays = Math.min(365, Math.max(0, Math.round(Number(days) || 0)));
    invoice.dueDays = dueDays;
    invoice.dueDate = new Date(new Date(invoice.invoiceDate || Date.now()).getTime() + dueDays * 86400000);
    await invoice.save();
    return invoice;
  }

  /** Changes the document date. A sale's profit is recalculated from the buy price of that day. */
  async setInvoiceDate(id: string, invoiceDate: string): Promise<InvoiceDocument> {
    const invoice = await this.findById(id);
    const previous = invoice.invoiceDate;
    const next = this.invoiceInstant(invoiceDate);
    if (Number.isNaN(+next)) throw new BadRequestException('تاریخ نامعتبر است');
    invoice.invoiceDate = next;
    if ((invoice.creditAmount || 0) > 0 && invoice.dueDays) {
      invoice.dueDate = new Date(next.getTime() + invoice.dueDays * 86400000);
    }
    await invoice.save();
    if (invoice.type === 'sale') await this.stampSaleProfit(invoice);
    if (invoice.type === 'purchase') await this.suppliersService.sync(invoice.customerName);
    if (purchaseEntersShop(invoice)) {
      await this.syncPricePeriods();
      const from = [previous, next].sort((a, b) => +new Date(a) - +new Date(b))[0];
      await this.restampSalesFrom(this.productIdsOf(invoice), from);
    }
    return this.findById(id);
  }

  /** The order day, the ship day, and the payment day are three different facts. */
  async setDates(id: string, body: { proformaDate?: string; shippedAt?: string; paidAt?: string; registeredAt?: string }) {
    const invoice = await this.findById(id);
    const at = (value?: string) => {
      if (!value) return undefined;
      const next = this.invoiceInstant(value);
      if (Number.isNaN(+next)) throw new BadRequestException('تاریخ نامعتبر است');
      return next;
    };
    const proformaDate = at(body.proformaDate);
    const shippedAt = at(body.shippedAt);
    const paidAt = at(body.paidAt);
    const registeredAt = at(body.registeredAt);
    if (!proformaDate && !shippedAt && !paidAt && !registeredAt) throw new BadRequestException('تاریخی برای ذخیره نیست');
    const previousDate = invoice.invoiceDate;
    if (proformaDate) {
      invoice.proformaDate = proformaDate;
      invoice.invoiceDate = proformaDate;
      if ((invoice.creditAmount || 0) > 0 && invoice.dueDays) {
        invoice.dueDate = new Date(proformaDate.getTime() + invoice.dueDays * 86400000);
      }
      if (invoice.factoryPurchaseId && Types.ObjectId.isValid(invoice.factoryPurchaseId)) {
        await this.invoiceModel.updateOne({ _id: invoice.factoryPurchaseId }, { $set: { invoiceDate: proformaDate, proformaDate } }).exec();
      }
    }
    if (shippedAt) invoice.shippedAt = shippedAt;
    if (registeredAt) {
      // A day-only edit must not erase the moment of registration — the list is ordered by it.
      const dayOnly = typeof body.registeredAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.registeredAt);
      const keep = invoice.registeredAt || invoice.createdAt;
      if (dayOnly && keep) {
        const at = new Date(registeredAt);
        const kept = new Date(keep);
        at.setHours(kept.getHours(), kept.getMinutes(), kept.getSeconds(), kept.getMilliseconds());
        invoice.registeredAt = at;
      } else {
        invoice.registeredAt = registeredAt;
      }
    }
    if (paidAt) {
      invoice.paidAt = paidAt;
      await this.customersService.movePaymentDate(String(invoice._id), paidAt);
    }
    await invoice.save();
    if (proformaDate && invoice.type === 'sale') await this.stampSaleProfit(invoice);
    if (proformaDate && purchaseEntersShop(invoice)) {
      await this.syncPricePeriods();
      const from = [previousDate, proformaDate].sort((a, b) => +new Date(a) - +new Date(b))[0];
      await this.restampSalesFrom(this.productIdsOf(invoice), from);
    }
    return this.findById(id);
  }

  async findAll(query?: {
    type?: string;
    saleType?: string;
    customerId?: string;
    search?: string;
    isPaid?: string;
    fulfillment?: string;
  }): Promise<InvoiceDocument[]> {
    await this.customersService.ensureReconciled();
    const filter: any = {};

    if (query?.type) filter.type = query.type;
    if (query?.fulfillment) filter.fulfillment = query.fulfillment;
    if (query?.saleType) filter.saleType = query.saleType;
    if (query?.customerId && Types.ObjectId.isValid(query.customerId)) {
      filter.customerId = new Types.ObjectId(query.customerId);
    }
    if (query?.isPaid !== undefined) filter.isPaid = query.isPaid === 'true';
    if (query?.search && query.search.trim()) {
      const s = query.search.trim();
      filter.$or = [
        { invoiceNumber: { $regex: s, $options: 'i' } },
        { customerName: { $regex: s, $options: 'i' } },
        { customerPhone: { $regex: s, $options: 'i' } },
      ];
    }

    // Newest registration first. The invoice date can be backdated on purpose, so it must not drive the order.
    return this.invoiceModel.find(filter).sort({ registeredAt: -1, createdAt: -1, _id: -1 }).exec();
  }

  async findById(id: string): Promise<InvoiceDocument> {
    if (!Types.ObjectId.isValid(id)) {
      throw new BadRequestException('شناسه فاکتور نامعتبر است');
    }
    const invoice = await this.invoiceModel.findById(id).exec();
    if (!invoice) {
      throw new NotFoundException('فاکتور یافت نشد');
    }
    return invoice;
  }

  async getStats(): Promise<{
    todaySalesAmount: number;
    todaySalesWeightKg: number;
    todaySalesTonnage: number;
    todayInvoicesCount: number;
    totalSalesAmount: number;
    totalSalesWeightKg: number;
    totalSalesTonnage: number;
    totalInvoicesCount: number;
    chartData: {
      date: string;
      dayName: string;
      amount: number;
      weightKg: number;
      tonnage: number;
    }[];
  }> {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const allSales = await this.invoiceModel
      .find({ type: 'sale' }, { totalAmount: 1, finalAmount: 1, discount: 1, shippingPayer: 1, shippingCost: 1, items: 1, totalWeightKg: 1, invoiceDate: 1, createdAt: 1 })
      .lean()
      .exec();

    let todaySalesAmount = 0;
    let todaySalesWeightKg = 0;
    let todayInvoicesCount = 0;
    let totalSalesAmount = 0;
    let totalSalesWeightKg = 0;

    const dayNames = ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'];
    const chartMap = new Map<string, { amount: number; weightKg: number; dayName: string }>();
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      chartMap.set(d.toISOString().split('T')[0], { amount: 0, weightKg: 0, dayName: dayNames[d.getDay()] });
    }

    for (const inv of allSales) {
      const amount = goodsAmount(inv);
      const weight = inv.totalWeightKg || 0;
      totalSalesAmount += amount;
      totalSalesWeightKg += weight;

      const invDate = new Date(inv.invoiceDate || (inv as any).createdAt);
      if (invDate >= startOfToday) {
        todaySalesAmount += amount;
        todaySalesWeightKg += weight;
        todayInvoicesCount++;
      }
      const entry = chartMap.get(invDate.toISOString().split('T')[0]);
      if (entry) {
        entry.amount += amount;
        entry.weightKg += weight;
      }
    }

    const chartData = Array.from(chartMap.entries()).map(([date, data]) => ({
      date,
      dayName: data.dayName,
      amount: data.amount,
      weightKg: Math.round(data.weightKg * 10) / 10,
      tonnage: Math.round((data.weightKg / 1000) * 100) / 100,
    }));

    return {
      todaySalesAmount,
      todaySalesWeightKg: Math.round(todaySalesWeightKg * 10) / 10,
      todaySalesTonnage: Math.round((todaySalesWeightKg / 1000) * 100) / 100,
      todayInvoicesCount,
      totalSalesAmount,
      totalSalesWeightKg: Math.round(totalSalesWeightKg * 10) / 10,
      totalSalesTonnage: Math.round((totalSalesWeightKg / 1000) * 100) / 100,
      totalInvoicesCount: allSales.length,
      chartData,
    };
  }

  /** Direct pair (factory purchase/sale) plus recent invoices that share a product. */
  async relations(id: string) {
    const invoice = await this.findById(id);
    const linkedIds = [invoice.factoryPurchaseId, invoice.factorySaleId].filter((value) => value && Types.ObjectId.isValid(String(value)));
    const select = 'invoiceNumber type customerName invoiceDate finalAmount fulfillment totalWeightKg';
    const linked = linkedIds.length
      ? await this.invoiceModel.find({ _id: { $in: linkedIds } }).select(select).lean().exec()
      : [];
    const productIds = [...new Set((invoice.items || []).map((item) => String(item.productId || '')).filter((value) => Types.ObjectId.isValid(value)))];
    const related = productIds.length
      ? await this.invoiceModel
          .find({
            _id: { $ne: invoice._id, $nin: linkedIds },
            'items.productId': { $in: productIds },
          })
          .sort({ invoiceDate: -1 })
          .limit(12)
          .select(select)
          .lean()
          .exec()
      : [];
    return { linked, related };
  }

  /**
   * Rewrite stored line weights from quantity × pack weight, then the invoice tonnage.
   * Only when the catalog weight is known. Ambiguous lines are returned, not guessed.
   */
  async recalculateWeights() {
    const products = await this.productModel.find().select('name unit weightPerUnitKg').lean().exec();
    const byId = new Map(products.map((p) => [String(p._id), p]));
    const invoices = await this.invoiceModel.find({ type: { $in: ['sale', 'purchase'] } }).exec();
    let invoicesChanged = 0;
    let linesFixed = 0;
    const unresolved: { invoiceId: string; invoiceNumber: string; productName: string; detail: string }[] = [];

    for (const inv of invoices) {
      let total = 0;
      let dirty = false;
      for (const item of inv.items || []) {
        const product = byId.get(String(item.productId || ''));
        const per = kgPerStock(product as any);
        const confident = per > 0;
        if (!confident) {
          const stored = Number(item.weightKg) || Number(item.secondaryQuantity) || 0;
          total += stored;
          if ((item.quantity || 0) > 0 && stored <= 0) {
            unresolved.push({
              invoiceId: String(inv._id),
              invoiceNumber: inv.invoiceNumber,
              productName: item.productName,
              detail: product
                ? `وزن هر ${product.unit || 'واحد'} «${product.name}» در کالا ثبت نشده`
                : `کالای «${item.productName}» در فهرست نیست`,
            });
          }
          continue;
        }
        const kg = lineKg(
          {
            productId: String(item.productId || ''),
            productName: item.productName,
            quantity: item.quantity,
            unit: item.unit,
            unitPrice: item.unitPrice,
            totalPrice: item.totalPrice || 0,
            weightKg: item.weightKg,
            secondaryQuantity: item.secondaryQuantity,
          },
          product as any,
        );
        const rounded = Math.round(kg * 10) / 10;
        total += rounded;
        if (Math.abs((Number(item.weightKg) || 0) - rounded) > 0.2) {
          item.weightKg = rounded;
          dirty = true;
          linesFixed += 1;
        }
      }
      const tw = Math.round(total * 10) / 10;
      if (Math.abs((inv.totalWeightKg || 0) - tw) > 0.2) {
        inv.totalWeightKg = tw;
        dirty = true;
      }
      if (dirty) {
        inv.markModified('items');
        await inv.save();
        invoicesChanged += 1;
      }
    }
    return { invoicesChanged, linesFixed, unresolved };
  }

  /**
   * Rewrite every product's stock from invoices.
   * Purchases count only when the goods were received. Sales count only when they left Ario stock.
   */
  async rebuildStock() {
    const catalog = await this.productModel.find().select('_id name').lean().exec();
    const byName = new Map<string, string>();
    const fold = (s: string) => s.replace(/ي/g, 'ی').replace(/ك/g, 'ک').replace(/\s+/g, ' ').trim().toLowerCase();
    for (const product of catalog) {
      const key = fold(product.name || '');
      if (key && !byName.has(key)) byName.set(key, String(product._id));
    }
    const invoices = await this.invoiceModel
      .find({ type: { $in: ['sale', 'purchase'] } })
      .select('type fulfillment customerName items')
      .exec();

    const totals = new Map<string, number>();
    let purchases = 0;
    let sales = 0;
    for (const inv of invoices) {
      const purchase = inv.type === 'purchase';
      if (purchase && !stockEntersShop(inv)) continue;
      if (!purchase && inv.fulfillment === 'factory') continue;
      if (purchase) purchases++;
      else sales++;
      let dirty = false;
      for (const item of inv.items || []) {
        let productId = String(item.productId || '');
        if (purchase && !Types.ObjectId.isValid(productId)) {
          const linked = byName.get(fold(item.productName || ''));
          if (!linked) continue;
          item.productId = linked;
          productId = linked;
          dirty = true;
        }
        if (!Types.ObjectId.isValid(productId)) continue;
        if (purchase && item.received === false) continue;
        totals.set(productId, (totals.get(productId) || 0) + (purchase ? 1 : -1) * (item.quantity || 0));
      }
      if (dirty) {
        inv.markModified('items');
        await inv.save();
      }
    }

    const products = await this.productModel.find().select('_id stock stockAdjust openingStock').lean().exec();
    const writes: { updateOne: { filter: { _id: unknown }; update: { $set: { stock: number } } } }[] = [];
    for (const product of products) {
      const id = String(product._id);
      const adjust = (product as { stockAdjust?: number }).stockAdjust || 0;
      const opening = product.openingStock || 0;
      if (!totals.has(id) && !adjust && !opening) continue;
      const stock = Math.round(((totals.get(id) || 0) + adjust + opening) * 1000) / 1000;
      if (Math.abs((product.stock || 0) - stock) < 0.0005) continue;
      writes.push({ updateOne: { filter: { _id: product._id }, update: { $set: { stock } } } });
    }
    if (writes.length) await this.productModel.bulkWrite(writes);
    return { changed: writes.length, products: totals.size, purchases, sales };
  }
}
