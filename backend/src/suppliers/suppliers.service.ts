import { BadRequestException, ConflictException, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Invoice, InvoiceDocument } from '../invoices/schemas/invoice.schema';
import { SupplierPayment, SupplierPaymentDocument } from './schemas/supplier-payment.schema';
import { SupplierAdjustment, SupplierAdjustmentDocument } from './schemas/supplier-adjustment.schema';
import { CreateSupplierPaymentDto, UpdateSupplierPaymentDto } from './dto/supplier-payment.dto';
import { CreateSupplierAdjustmentDto, UpdateSupplierAdjustmentDto } from './dto/supplier-adjustment.dto';
import { canonicalSupplier, clean, PARENT_COMPANY, setRegisteredSuppliers } from './supplier-names';
import { SupplierCompany, SupplierCompanyDocument } from './schemas/supplier-company.schema';
import { CreateSupplierCompanyDto, SupplierBankAccountDto, UpdateSupplierCompanyDto } from './dto/supplier-company.dto';
import { Product, ProductDocument } from '../products/schemas/product.schema';

const normAccount = (a: SupplierBankAccountDto) => ({
  holder: (a.holder || '').trim(),
  bank: (a.bank || '').trim(),
  cardNumber: (a.cardNumber || '').replace(/[^0-9۰-۹]/g, '').replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))),
  iban: (a.iban || '').replace(/\s/g, '').toUpperCase(),
  accountNumber: (a.accountNumber || '').trim(),
});

const r0 = (n: number) => Math.round(n);
const EPS = 0.5;

const METHOD_LABELS: Record<string, string> = {
  card_to_card: 'کارت‌به‌کارت',
  cheque: 'چک',
  cash: 'نقدی',
  paya: 'پایا / ساتنا',
  pos: 'کارتخوان',
  transfer: 'حواله بانکی',
  split: 'ترکیبی',
  credit: 'اعتباری',
  other: 'سایر',
};

interface PurchaseRow {
  _id: Types.ObjectId;
  invoiceNumber: string;
  invoiceDate: Date;
  createdAt?: Date;
  customerName: string;
  finalAmount: number;
  totalWeightKg: number;
  creditAmount: number;
  paidAmount: number;
  remainingDebt: number;
  isPaid: boolean;
  fulfillment?: string;
}

@Injectable()
export class SuppliersService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SuppliersService.name);

  constructor(
    @InjectModel(SupplierPayment.name) private paymentModel: Model<SupplierPaymentDocument>,
    @InjectModel(SupplierAdjustment.name) private adjustmentModel: Model<SupplierAdjustmentDocument>,
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(SupplierCompany.name) private companyModel: Model<SupplierCompanyDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
  ) {}

  async onApplicationBootstrap() {
    try {
      await this.ensureParentCompany();
      await this.refreshRegistered();
      await this.syncAll();
    } catch (err) {
      this.logger.error(`Supplier sync failed: ${(err as Error).message}`);
    }
  }

  private async purchasesOf(supplier: string): Promise<PurchaseRow[]> {
    const all = await this.invoiceModel
      .find({ type: 'purchase' })
      .select('invoiceNumber invoiceDate createdAt customerName finalAmount totalWeightKg creditAmount paidAmount remainingDebt isPaid fulfillment')
      .lean<PurchaseRow[]>();
    return all
      .filter((i) => canonicalSupplier(i.customerName) === supplier)
      .sort((a, b) => +new Date(a.invoiceDate) - +new Date(b.invoiceDate) || +new Date(a.createdAt ?? 0) - +new Date(b.createdAt ?? 0));
  }

  async syncAll() {
    const names = new Set<string>();
    for (const n of await this.invoiceModel.distinct('customerName', { type: 'purchase' })) names.add(canonicalSupplier(n));
    for (const n of await this.paymentModel.distinct('supplier')) names.add(canonicalSupplier(n));
    for (const n of names) await this.sync(n);
  }

  /**
   * Allocate the supplier's payments to its credit purchases, oldest invoice first,
   * and write paid / remaining back onto each purchase invoice.
   */
  async sync(supplierName: string) {
    const supplier = canonicalSupplier(supplierName);
    const [invoices, payments] = await Promise.all([
      this.purchasesOf(supplier),
      this.paymentModel.find({ supplier }).sort({ date: 1, createdAt: 1 }).exec(),
    ]);

    const open = invoices.map((inv) => ({ inv, left: Math.max(0, inv.creditAmount || 0), paid: 0, settledAt: null as Date | null, pays: [] as { paymentId: string; date: Date; amount: number }[] }));
    let cursor = 0;
    const allocationsByPayment = new Map<string, { invoiceId: Types.ObjectId; invoiceNumber: string; amount: number }[]>();

    for (const p of payments) {
      let money = p.amount;
      const allocs: { invoiceId: Types.ObjectId; invoiceNumber: string; amount: number }[] = [];
      while (money > EPS && cursor < open.length) {
        const o = open[cursor];
        if (o.left <= EPS) {
          cursor++;
          continue;
        }
        const take = Math.min(o.left, money);
        o.left -= take;
        o.paid += take;
        money -= take;
        o.pays.push({ paymentId: String(p._id), date: p.date, amount: take });
        allocs.push({ invoiceId: o.inv._id, invoiceNumber: o.inv.invoiceNumber, amount: r0(take) });
        if (o.left <= EPS) {
          o.settledAt = p.date;
          cursor++;
        }
      }
      allocationsByPayment.set(String(p._id), allocs);
    }

    const writes: Promise<unknown>[] = [];
    for (const o of open) {
      const credit = Math.max(0, o.inv.creditAmount || 0);
      const upfront = Math.max(0, o.inv.finalAmount - credit);
      const remainingDebt = r0(Math.max(0, credit - o.paid));
      const paidAmount = r0(Math.min(o.inv.finalAmount, upfront + o.paid));
      const isPaid = remainingDebt <= EPS;
      if (o.inv.remainingDebt !== remainingDebt || o.inv.paidAmount !== paidAmount || o.inv.isPaid !== isPaid) {
        writes.push(this.invoiceModel.updateOne({ _id: o.inv._id }, { $set: { remainingDebt, paidAmount, isPaid } }, { timestamps: false }).exec());
      }
    }
    for (const p of payments) {
      const next = allocationsByPayment.get(String(p._id)) ?? [];
      const same =
        next.length === p.allocations.length &&
        next.every((a, i) => String(a.invoiceId) === String(p.allocations[i].invoiceId) && a.amount === p.allocations[i].amount);
      if (!same) writes.push(this.paymentModel.updateOne({ _id: p._id }, { $set: { allocations: next } }, { timestamps: false }).exec());
    }
    await Promise.all(writes);

    return { supplier, invoices, payments, open, allocationsByPayment };
  }

  private purchaseChannel(invoices: PurchaseRow[]) {
    return {
      count: invoices.length,
      amount: r0(invoices.reduce((s, i) => s + (i.finalAmount || 0), 0)),
      kg: Math.round(invoices.reduce((s, i) => s + (i.totalWeightKg || 0), 0)),
    };
  }

  /** حساب یک تامین‌کننده: کل خرید، پرداختی‌ها به تفکیک مقصد، بدهی فعلی و گردش حساب. */
  async account(name?: string) {
    const { supplier, invoices, payments, open, allocationsByPayment } = await this.sync(name || PARENT_COMPANY);

    const adjustments = await this.adjustmentModel.find({ supplier }).sort({ date: 1, createdAt: 1 }).exec();
    const purchasesTotal = invoices.reduce((s, i) => s + i.finalAmount, 0);
    const creditTotal = invoices.reduce((s, i) => s + Math.max(0, i.creditAmount || 0), 0);
    const paidOnSpot = purchasesTotal - creditTotal;
    const paymentsTotal = payments.reduce((s, p) => s + p.amount, 0);
    const adjustmentsTotal = adjustments.reduce((s, a) => s + a.amount, 0);
    const allocated = open.reduce((s, o) => s + o.paid, 0);
    const debt = creditTotal - paymentsTotal + adjustmentsTotal;

    const group = (key: (p: SupplierPaymentDocument) => string) => {
      const m = new Map<string, { key: string; amount: number; count: number; lastDate: Date }>();
      for (const p of payments) {
        const k = key(p);
        const g = m.get(k) ?? { key: k, amount: 0, count: 0, lastDate: p.date };
        g.amount += p.amount;
        g.count++;
        if (p.date > g.lastDate) g.lastDate = p.date;
        m.set(k, g);
      }
      return [...m.values()].sort((a, b) => b.amount - a.amount);
    };

    const openInvoices = open.filter((o) => o.left > EPS);
    const oldestOpen = openInvoices[0]?.inv;

    const events = [
      ...invoices
        .filter((i) => (i.creditAmount || 0) > 0)
        .map((i) => ({ kind: 'purchase' as const, id: String(i._id), date: i.invoiceDate, order: +new Date(i.createdAt ?? i.invoiceDate), amount: i.creditAmount, increasesDebt: true, label: i.invoiceNumber })),
      ...payments.map((p) => ({ kind: 'payment' as const, id: String(p._id), date: p.date, order: +new Date(p.createdAt ?? p.date), amount: p.amount, increasesDebt: false, label: p.destination || 'نامشخص' })),
      ...adjustments.map((a) => ({
        kind: 'adjustment' as const,
        id: String(a._id),
        date: a.date,
        order: +new Date(a.createdAt ?? a.date),
        amount: Math.abs(a.amount),
        increasesDebt: a.amount > 0,
        label: a.title,
      })),
    ].sort((a, b) => +new Date(a.date) - +new Date(b.date) || (a.kind === b.kind ? a.order - b.order : a.kind === 'purchase' ? -1 : 1));
    let balance = 0;
    const timeline = events.map((e) => {
      balance += e.increasesDebt ? e.amount : -e.amount;
      return { kind: e.kind, id: e.id, date: e.date, amount: r0(e.amount), increasesDebt: e.increasesDebt, label: e.label, balance: r0(balance) };
    });

    return {
      supplier,
      summary: {
        purchasesTotal: r0(purchasesTotal),
        purchasesCount: invoices.length,
        purchasedKg: Math.round(invoices.reduce((s, i) => s + (i.totalWeightKg || 0), 0)),
        paidOnSpot: r0(paidOnSpot),
        creditTotal: r0(creditTotal),
        paymentsTotal: r0(paymentsTotal),
        paymentsCount: payments.length,
        adjustmentsTotal: r0(adjustmentsTotal),
        adjustmentsCount: adjustments.length,
        totalPaid: r0(paidOnSpot + paymentsTotal),
        debt: r0(Math.max(0, debt)),
        prepaid: r0(Math.max(0, -debt)),
        unallocated: r0(paymentsTotal - allocated),
        openInvoices: openInvoices.length,
        oldestOpenDate: oldestOpen?.invoiceDate ?? null,
        oldestOpenInvoice: oldestOpen?.invoiceNumber ?? null,
        lastPaymentDate: payments.length ? payments[payments.length - 1].date : null,
      },
      purchaseChannels: {
        shop: this.purchaseChannel(invoices.filter((i) => i.fulfillment !== 'factory')),
        factory: this.purchaseChannel(invoices.filter((i) => i.fulfillment === 'factory')),
      },
      byDestination: group((p) => p.destination || 'نامشخص').map((g) => ({
        destination: g.key,
        amount: r0(g.amount),
        count: g.count,
        lastDate: g.lastDate,
        accounts: [...new Set(payments.filter((p) => (p.destination || 'نامشخص') === g.key && p.destinationAccount).map((p) => p.destinationAccount))],
      })),
      byMethod: group((p) => p.method).map((g) => ({ method: g.key, amount: r0(g.amount), count: g.count })),
      payments: payments
        .map((p) => {
          const allocs = allocationsByPayment.get(String(p._id)) ?? [];
          return {
            _id: String(p._id),
            date: p.date,
            amount: p.amount,
            method: p.method,
            destination: p.destination,
            destinationAccount: p.destinationAccount,
            notes: p.notes,
            rawSupplier: p.rawSupplier,
            legacy: !!p.legacyId,
            externalRef: p.externalRef || '',
            allocations: allocs.map((a) => ({ invoiceId: String(a.invoiceId), invoiceNumber: a.invoiceNumber, amount: a.amount })),
            unallocated: r0(p.amount - allocs.reduce((s, a) => s + a.amount, 0)),
            createdAt: p.createdAt,
          };
        })
        .reverse(),
      invoices: open
        .map((o) => ({
          invoiceId: String(o.inv._id),
          invoiceNumber: o.inv.invoiceNumber,
          date: o.inv.invoiceDate,
          amount: r0(o.inv.finalAmount),
          kg: o.inv.totalWeightKg || 0,
          credit: r0(o.inv.creditAmount || 0),
          upfront: r0(Math.max(0, o.inv.finalAmount - (o.inv.creditAmount || 0))),
          paid: r0(o.paid),
          remaining: r0(o.left),
          fulfillment: o.inv.fulfillment === 'factory' ? 'factory' : 'shop',
          settledAt: o.settledAt,
          ageDays: Math.floor((Date.now() - +new Date(o.inv.invoiceDate)) / 86400000),
          payments: o.pays.map((x) => ({ ...x, amount: r0(x.amount) })),
        }))
        .reverse(),
      adjustments: adjustments
        .map((a) => ({
          _id: String(a._id),
          date: a.date,
          amount: a.amount,
          kind: a.kind,
          externalRef: a.externalRef || '',
          title: a.title,
          notes: a.notes || '',
          relatedInvoiceNumber: a.relatedInvoiceNumber || '',
          createdAt: a.createdAt,
        }))
        .reverse(),
      timeline: timeline.reverse(),
      destinations: [...new Set(payments.map((p) => p.destination).filter(Boolean))],
    };
  }

  /**
   * دفتر معین تأمین‌کننده.
   * خرید نسیه بستانکار است (بدهی ما زیاد می‌شود) و پرداخت بدهکار است (بدهی کم می‌شود).
   * ماندهٔ مثبت بستانکار است؛ ماندهٔ منفی بدهکار (پیش‌پرداخت).
   */
  async statement(name: string | undefined, from?: string, to?: string) {
    const supplier = canonicalSupplier(name || PARENT_COMPANY);
    const [{ invoices, payments }, adjustments] = await Promise.all([
      this.sync(supplier),
      this.adjustmentModel.find({ supplier }).exec(),
    ]);
    const keyOf = (d: Date | string) =>
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(d));
    const start = (from || '').slice(0, 10);
    const end = (to || '').slice(0, 10);
    const side = (signed: number) => (signed >= 0 ? { credit: r0(signed), debit: 0 } : { credit: 0, debit: r0(-signed) });
    const before = (day: string) => !!start && day < start;
    const inside = (day: string) => (!start || day >= start) && (!end || day <= end);

    let opening = 0;
    let periodCredit = 0;
    let periodDebit = 0;
    for (const inv of invoices) {
      const day = keyOf(inv.invoiceDate);
      const credit = Math.max(0, inv.creditAmount || 0);
      if (before(day)) opening += credit;
      else if (inside(day)) periodCredit += credit;
    }
    for (const p of payments) {
      const day = keyOf(p.date);
      if (before(day)) opening -= p.amount;
      else if (inside(day)) periodDebit += p.amount;
    }
    for (const a of adjustments) {
      const day = keyOf(a.date);
      if (before(day)) opening += a.amount;
      else if (inside(day)) {
        if (a.amount >= 0) periodCredit += a.amount;
        else periodDebit += -a.amount;
      }
    }
    const closing = opening + periodCredit - periodDebit;

    const docs = await this.invoiceModel
      .find({ type: 'purchase' })
      .select('invoiceDate customerName fulfillment items')
      .lean();
    const products = new Map<string, { productId: string; name: string; unit: string; quantity: number; kg: number; amount: number; invoices: number }>();
    for (const inv of docs) {
      if (canonicalSupplier(inv.customerName) !== supplier) continue;
      if (!inside(keyOf(inv.invoiceDate))) continue;
      const seen = new Set<string>();
      for (const it of inv.items || []) {
        const id = String(it.productId || it.productName || '');
        if (!id) continue;
        const row = products.get(id) ?? {
          productId: id,
          name: it.productName,
          unit: it.unit || '',
          quantity: 0,
          kg: 0,
          amount: 0,
          invoices: 0,
        };
        row.quantity += it.quantity || 0;
        row.kg += it.weightKg || 0;
        row.amount += it.totalPrice || 0;
        if (!seen.has(id)) {
          row.invoices++;
          seen.add(id);
        }
        products.set(id, row);
      }
    }

    return {
      supplier,
      from: start || null,
      to: end || null,
      opening: side(opening),
      period: { credit: r0(periodCredit), debit: r0(periodDebit) },
      closing: side(closing),
      products: [...products.values()]
        .map((p) => ({ ...p, quantity: Math.round(p.quantity * 1000) / 1000, kg: Math.round(p.kg * 10) / 10, amount: r0(p.amount) }))
        .sort((a, b) => b.amount - a.amount),
    };
  }

  // ---------------------------------------------------------------------------
  // Supplier companies
  // ---------------------------------------------------------------------------

  private async refreshRegistered() {
    const names = await this.companyModel.distinct('name');
    setRegisteredSuppliers(names as string[]);
  }

  /** The parent company always exists; its accounts start from where old payments were sent. */
  private async ensureParentCompany() {
    if (await this.companyModel.exists({ name: PARENT_COMPANY })) return;
    const pairs = await this.paymentModel.aggregate<{ _id: { d: string; a: string } }>([
      { $match: { destination: { $nin: ['', null, 'نامشخص'] } } },
      { $group: { _id: { d: '$destination', a: '$destinationAccount' } } },
    ]);
    const accounts = pairs.map(({ _id }) => {
      const acc = (_id.a || '').replace(/\s/g, '');
      return normAccount({
        holder: _id.d,
        iban: /^IR/i.test(acc) ? acc : '',
        cardNumber: /^\d{16}$/.test(acc) ? acc : '',
        accountNumber: acc && !/^IR/i.test(acc) && !/^\d{16}$/.test(acc) ? acc : '',
      });
    });
    await this.companyModel.create({ name: PARENT_COMPANY, accounts, notes: 'شرکت مادر' });
  }

  /** All suppliers (defined companies plus any name seen on purchases/payments) with their balances. */
  async suppliers() {
    const companies = await this.companyModel.find().lean();
    const names = new Set<string>([PARENT_COMPANY, ...companies.map((c) => c.name)]);
    for (const n of await this.invoiceModel.distinct('customerName', { type: 'purchase' })) names.add(canonicalSupplier(n));
    for (const n of await this.paymentModel.distinct('supplier')) names.add(canonicalSupplier(n));
    for (const n of await this.adjustmentModel.distinct('supplier')) names.add(canonicalSupplier(n));

    const out: any[] = [];
    for (const name of names) {
      const a = await this.account(name);
      const c = companies.find((x) => x.name === name);
      out.push({
        _id: c ? String(c._id) : null,
        name,
        phone: c?.phone || '',
        contactName: c?.contactName || '',
        accountsCount: c?.accounts?.length || 0,
        isActive: c ? c.isActive !== false : true,
        registered: !!c,
        isParent: name === PARENT_COMPANY,
        debt: a.summary.debt,
        prepaid: a.summary.prepaid,
        purchasesTotal: a.summary.purchasesTotal,
        purchasesCount: a.summary.purchasesCount,
        purchasedKg: a.summary.purchasedKg,
        paymentsTotal: a.summary.paymentsTotal,
        openInvoices: a.summary.openInvoices,
        lastPurchaseDate: a.invoices[0]?.date ?? null,
      });
    }
    return out.sort((a, b) => Number(b.isParent) - Number(a.isParent) || b.debt - a.debt || b.purchasesTotal - a.purchasesTotal);
  }

  /** Company card + account + everything bought from it, product by product. */
  async profile(name?: string): Promise<Record<string, any>> {
    const supplier = canonicalSupplier(name || PARENT_COMPANY);
    const [company, account, purchases, defaults] = await Promise.all([
      this.companyModel.findOne({ name: supplier }).lean(),
      this.account(supplier),
      this.invoiceModel.find({ type: 'purchase' }).select('customerName invoiceDate items').lean(),
      this.productModel.find({ supplierName: supplier, isActive: true }).select('name unit stock weightPerUnitKg').lean(),
    ]);

    const byProduct = new Map<string, { productId: string; name: string; unit: string; kg: number; quantity: number; amount: number; invoices: number; lastDate: Date | null; lastUnitPrice: number; lastPricePerKg: number }>();
    for (const inv of purchases.filter((i) => canonicalSupplier(i.customerName) === supplier)) {
      for (const it of inv.items || []) {
        const row = byProduct.get(it.productId) ?? { productId: it.productId, name: it.productName, unit: it.unit, kg: 0, quantity: 0, amount: 0, invoices: 0, lastDate: null, lastUnitPrice: 0, lastPricePerKg: 0 };
        row.kg += it.weightKg || 0;
        row.quantity += it.quantity || 0;
        row.amount += it.totalPrice || 0;
        row.invoices++;
        if (!row.lastDate || +new Date(inv.invoiceDate) >= +row.lastDate) {
          row.lastDate = inv.invoiceDate;
          row.lastUnitPrice = it.unitPrice || 0;
          row.lastPricePerKg = it.weightKg ? Math.round((it.totalPrice || 0) / it.weightKg) : 0;
          row.name = it.productName;
        }
        byProduct.set(it.productId, row);
      }
    }
    for (const p of defaults) {
      const id = String(p._id);
      if (!byProduct.has(id)) {
        byProduct.set(id, { productId: id, name: p.name, unit: p.unit, kg: 0, quantity: 0, amount: 0, invoices: 0, lastDate: null, lastUnitPrice: 0, lastPricePerKg: 0 });
      }
    }
    const stock = new Map(
      (await this.productModel.find({ _id: { $in: [...byProduct.keys()].filter((id) => Types.ObjectId.isValid(id)) } }).select('stock unit').lean()).map((p) => [String(p._id), p]),
    );

    return {
      company: company ? { ...company, _id: String(company._id) } : { _id: null, name: supplier, phone: '', contactName: '', address: '', notes: '', accounts: [], isActive: true },
      registered: !!company,
      isParent: supplier === PARENT_COMPANY,
      account,
      products: [...byProduct.values()]
        .map((r) => ({
          ...r,
          kg: Math.round(r.kg),
          amount: r0(r.amount),
          avgPricePerKg: r.kg ? r0(r.amount / r.kg) : 0,
          stock: stock.get(r.productId)?.stock ?? null,
          isDefault: defaults.some((d) => String(d._id) === r.productId),
        }))
        .sort((a, b) => b.amount - a.amount),
    };
  }

  async createCompany(dto: CreateSupplierCompanyDto) {
    const name = clean(dto.name);
    if (!name) throw new BadRequestException('نام شرکت الزامی است');
    if (await this.companyModel.exists({ name })) throw new ConflictException('این شرکت قبلا ثبت شده است');
    const created = await this.companyModel.create({
      name,
      phone: dto.phone?.trim() || '',
      contactName: dto.contactName?.trim() || '',
      address: dto.address?.trim() || '',
      notes: dto.notes?.trim() || '',
      accounts: (dto.accounts || []).map(normAccount).filter((a) => a.holder || a.cardNumber || a.iban || a.accountNumber),
    });
    await this.refreshRegistered();
    return created;
  }

  async updateCompany(id: string, dto: UpdateSupplierCompanyDto) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('شرکت یافت نشد');
    const company = await this.companyModel.findById(id).exec();
    if (!company) throw new NotFoundException('شرکت یافت نشد');
    const oldName = company.name;

    if (dto.name !== undefined && clean(dto.name) !== oldName) {
      const name = clean(dto.name);
      if (!name) throw new BadRequestException('نام شرکت الزامی است');
      if (oldName === PARENT_COMPANY) throw new BadRequestException('نام شرکت مادر قابل تغییر نیست');
      if (await this.companyModel.exists({ name })) throw new ConflictException('این نام برای شرکت دیگری ثبت شده است');
      company.name = name;
    }
    for (const k of ['phone', 'contactName', 'address', 'notes'] as const) {
      if (dto[k] !== undefined) company[k] = (dto[k] || '').trim();
    }
    if (dto.isActive !== undefined) company.isActive = dto.isActive;
    if (dto.accounts) {
      company.accounts = dto.accounts.map(normAccount).filter((a) => a.holder || a.cardNumber || a.iban || a.accountNumber) as any;
    }
    await company.save();

    if (company.name !== oldName) {
      await this.invoiceModel.updateMany({ type: 'purchase', customerName: oldName }, { $set: { customerName: company.name } }, { timestamps: false });
      await this.paymentModel.updateMany({ supplier: oldName }, { $set: { supplier: company.name } });
      await this.adjustmentModel.updateMany({ supplier: oldName }, { $set: { supplier: company.name } });
      await this.productModel.updateMany({ supplierName: oldName }, { $set: { supplierName: company.name } });
      await this.refreshRegistered();
      await this.sync(company.name);
    }
    return company;
  }

  async removeCompany(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('شرکت یافت نشد');
    const company = await this.companyModel.findById(id).exec();
    if (!company) throw new NotFoundException('شرکت یافت نشد');
    if (company.name === PARENT_COMPANY) throw new BadRequestException('شرکت مادر قابل حذف نیست');
    const used =
      (await this.invoiceModel.exists({ type: 'purchase', customerName: company.name })) ||
      (await this.paymentModel.exists({ supplier: company.name })) ||
      (await this.adjustmentModel.exists({ supplier: company.name }));
    if (used) throw new BadRequestException('این شرکت فاکتور یا پرداخت دارد؛ به‌جای حذف، غیرفعالش کنید');
    await company.deleteOne();
    await this.productModel.updateMany({ supplierName: company.name }, { $set: { supplierName: '' } });
    await this.refreshRegistered();
    return { message: `شرکت ${company.name} حذف شد` };
  }

  async createPayment(dto: CreateSupplierPaymentDto, recordedByName: string) {
    const supplier = canonicalSupplier(dto.supplier || PARENT_COMPANY);
    await this.paymentModel.create({
      supplier,
      amount: dto.amount,
      date: new Date(dto.date),
      method: dto.method || 'card_to_card',
      destination: dto.destination?.trim() || '',
      destinationAccount: dto.destinationAccount?.trim() || '',
      notes: dto.notes?.trim() || '',
      ...(dto.externalRef?.trim() ? { externalRef: dto.externalRef.trim() } : {}),
      createdByName: recordedByName,
    });
    return this.account(supplier);
  }

  async updatePayment(id: string, dto: UpdateSupplierPaymentDto) {
    const p = await this.findPayment(id);
    const previous = p.supplier;
    if (dto.supplier) p.supplier = canonicalSupplier(dto.supplier);
    if (dto.amount !== undefined) p.amount = dto.amount;
    if (dto.date) p.date = new Date(dto.date);
    if (dto.method) p.method = dto.method;
    if (dto.destination !== undefined) p.destination = dto.destination.trim();
    if (dto.destinationAccount !== undefined) p.destinationAccount = dto.destinationAccount.trim();
    if (dto.notes !== undefined) p.notes = dto.notes.trim();
    await p.save();
    if (previous !== p.supplier) await this.sync(previous);
    return this.account(p.supplier);
  }

  async removePayment(id: string) {
    const p = await this.findPayment(id);
    await p.deleteOne();
    return this.account(p.supplier);
  }

  async createAdjustment(dto: CreateSupplierAdjustmentDto, recordedByName: string) {
    if (!dto.amount) throw new BadRequestException('مبلغ تعدیل نمی‌تواند صفر باشد');
    const supplier = canonicalSupplier(dto.supplier || PARENT_COMPANY);
    const externalRef = dto.externalRef?.trim() || '';
    if (externalRef) {
      const existing = await this.adjustmentModel.findOne({ externalRef }).exec();
      if (existing) return this.account(existing.supplier);
    }
    await this.adjustmentModel.create({
      supplier,
      date: new Date(dto.date),
      amount: r0(dto.amount),
      kind: dto.kind || 'reconcile',
      ...(externalRef ? { externalRef } : {}),
      title: dto.title.trim(),
      notes: dto.notes?.trim() || '',
      relatedInvoiceNumber: dto.relatedInvoiceNumber?.trim() || '',
      createdByName: recordedByName,
    });
    return this.account(supplier);
  }

  async updateAdjustment(id: string, dto: UpdateSupplierAdjustmentDto) {
    const row = await this.findAdjustment(id);
    const previous = row.supplier;
    if (dto.supplier) row.supplier = canonicalSupplier(dto.supplier);
    if (dto.date) row.date = new Date(dto.date);
    if (dto.amount !== undefined) {
      if (!dto.amount) throw new BadRequestException('مبلغ تعدیل نمی‌تواند صفر باشد');
      row.amount = r0(dto.amount);
    }
    if (dto.kind) row.kind = dto.kind;
    if (dto.title !== undefined) row.title = dto.title.trim();
    if (dto.notes !== undefined) row.notes = dto.notes.trim();
    if (dto.relatedInvoiceNumber !== undefined) row.relatedInvoiceNumber = dto.relatedInvoiceNumber.trim();
    await row.save();
    if (previous !== row.supplier) await this.sync(previous);
    return this.account(row.supplier);
  }

  async removeAdjustment(id: string) {
    const row = await this.findAdjustment(id);
    await row.deleteOne();
    return this.account(row.supplier);
  }

  private async findAdjustment(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('تعدیل یافت نشد');
    const row = await this.adjustmentModel.findById(id).exec();
    if (!row) throw new NotFoundException('تعدیل یافت نشد');
    return row;
  }

  private async findPayment(id: string) {
    if (!Types.ObjectId.isValid(id)) throw new NotFoundException('پرداخت یافت نشد');
    const p = await this.paymentModel.findById(id).exec();
    if (!p) throw new NotFoundException('پرداخت یافت نشد');
    return p;
  }

  /**
   * خروجی صورت‌حساب و مغایرت‌گیری اکسل (CSV با فرمت UTF-8 BOM مخصوص اکسل)
   * شامل ریز فاکتورها، پرداختی‌ها، اقلام بار، شرح سند و مانده تجمعی حساب
   */
  /**
   * Products booked on the wrong company: point them at `to`, and move the purchase
   * invoices that contain them. A mixed invoice is split so the other goods stay put.
   */
  async reassignProducts(fromName: string | undefined, productIds: string[], toName: string) {
    const ids = [...new Set((productIds || []).filter((id) => Types.ObjectId.isValid(id)))];
    if (!ids.length) throw new BadRequestException('کالایی انتخاب نشده');
    const toClean = clean(toName);
    if (!toClean) throw new BadRequestException('نام شرکت مقصد الزامی است');
    if (!(await this.companyModel.exists({ name: toClean }))) {
      await this.companyModel.create({ name: toClean, accounts: [], notes: '' });
      await this.refreshRegistered();
    }
    const to = canonicalSupplier(toClean);
    const from = canonicalSupplier(fromName || PARENT_COMPANY);
    if (from === to) throw new BadRequestException('مقصد با شرکت فعلی یکی است');

    await this.productModel.updateMany({ _id: { $in: ids } }, { $set: { supplierName: to } });
    const idSet = new Set(ids);
    const invoices = await this.invoiceModel.find({ type: 'purchase' }).exec();
    let movedInvoices = 0;
    let splitInvoices = 0;

    for (const inv of invoices) {
      if (canonicalSupplier(inv.customerName) !== from) continue;
      const items = [...(inv.items || [])];
      const moving = items.filter((it) => idSet.has(String(it.productId)));
      if (!moving.length) continue;

      if (moving.length === items.length) {
        inv.customerName = to;
        await inv.save();
        movedInvoices++;
        continue;
      }

      const lineSum = items.reduce((s, it) => s + (it.totalPrice || 0), 0);
      const movedSum = moving.reduce((s, it) => s + (it.totalPrice || 0), 0);
      const share = lineSum > 0 ? movedSum / lineSum : moving.length / items.length;
      const origFinal = inv.finalAmount || 0;
      const origCredit = inv.creditAmount || 0;
      const origWeight = inv.totalWeightKg || 0;
      const origTotal = inv.totalAmount || 0;
      const origDiscount = inv.discount || 0;
      const movedFinal = Math.round(origFinal * share);
      const movedCredit = Math.min(movedFinal, Math.round(origCredit * share));
      const movedWeight = Math.round(moving.reduce((s, it) => s + (it.weightKg || 0), 0) * 10) / 10;

      inv.items = items.filter((it) => !idSet.has(String(it.productId))) as any;
      inv.totalAmount = Math.max(0, Math.round(origTotal * (1 - share)));
      inv.discount = Math.max(0, Math.round(origDiscount * (1 - share)));
      inv.finalAmount = Math.max(0, origFinal - movedFinal);
      inv.totalWeightKg = Math.max(0, Math.round((origWeight - movedWeight) * 10) / 10);
      inv.creditAmount = Math.max(0, origCredit - movedCredit);
      inv.paidAmount = Math.max(0, inv.finalAmount - inv.creditAmount);
      inv.remainingDebt = inv.creditAmount;
      inv.isPaid = inv.creditAmount <= 0;
      await inv.save();

      let number = `${inv.invoiceNumber}-2`;
      let n = 2;
      while (await this.invoiceModel.exists({ invoiceNumber: number })) {
        n += 1;
        number = `${inv.invoiceNumber}-${n}`;
      }
      await this.invoiceModel.create({
        invoiceNumber: number,
        type: 'purchase',
        saleType: inv.saleType || 'retail',
        customerName: to,
        customerPhone: inv.customerPhone || '',
        invoiceDate: inv.invoiceDate,
        items: moving,
        totalAmount: Math.max(0, Math.round(origTotal * share)),
        discount: Math.max(0, Math.round(origDiscount * share)),
        finalAmount: movedFinal,
        totalWeightKg: movedWeight,
        paymentMethod: movedCredit > 0 ? 'credit' : 'cash',
        creditAmount: movedCredit,
        paidAmount: Math.max(0, movedFinal - movedCredit),
        remainingDebt: movedCredit,
        isPaid: movedCredit <= 0,
        notes: `انتقال کالا از ${from}، فاکتور ${inv.invoiceNumber}`,
        createdByName: inv.createdByName || '',
      });
      splitInvoices++;
    }

    await this.sync(from);
    await this.sync(to);
    return { products: ids.length, movedInvoices, splitInvoices, to };
  }

  async exportReconciliationCsv(supplierName?: string): Promise<{ csv: string; filename: string }> {
    const supplier = canonicalSupplier(supplierName || PARENT_COMPANY);
    const isParent = supplier === PARENT_COMPANY;
    const company = await this.companyModel.findOne({ name: supplier }).lean();

    const [invoices, payments] = await Promise.all([
      this.invoiceModel
        .find({ type: 'purchase' })
        .select('invoiceNumber invoiceDate createdAt customerName finalAmount totalWeightKg creditAmount paidAmount remainingDebt isPaid items notes paymentMethod createdByName')
        .lean(),
      this.paymentModel
        .find({ supplier })
        .sort({ date: 1, createdAt: 1 })
        .lean(),
    ]);

    const supplierInvoices = invoices
      .filter((i) => canonicalSupplier(i.customerName) === supplier)
      .sort((a, b) => +new Date(a.invoiceDate) - +new Date(b.invoiceDate) || +new Date(a.createdAt ?? 0) - +new Date(b.createdAt ?? 0));

    interface LedgerRow {
      date: Date;
      order: number;
      kind: 'purchase' | 'payment' | 'upfront';
      ref: string;
      desc: string;
      method: string;
      debit: number;
      credit: number;
      notes: string;
    }

    const ledger: LedgerRow[] = [];

    for (const inv of supplierInvoices) {
      const itemsDesc = (inv.items || [])
        .map((it: any) => `${it.productName} (${it.quantity} ${it.unit || ''}${it.weightKg ? ` / ${Math.round(it.weightKg * 10) / 10} کیلو` : ''})`)
        .join(' | ');

      const totalWeight = inv.totalWeightKg ? ` - وزن کل: ${Math.round(inv.totalWeightKg)} کیلوگرم` : '';
      const invoiceDesc = `فاکتور خرید بار ${inv.invoiceNumber}${totalWeight}${itemsDesc ? ` - اقلام: ${itemsDesc}` : ''}`;

      ledger.push({
        date: new Date(inv.invoiceDate || inv.createdAt),
        order: +new Date(inv.createdAt ?? inv.invoiceDate),
        kind: 'purchase',
        ref: inv.invoiceNumber,
        desc: invoiceDesc,
        method: inv.creditAmount ? 'اعتباری / نسیه' : 'تسویه نقدی پای بار',
        debit: r0(inv.finalAmount || 0),
        credit: 0,
        notes: inv.notes || '',
      });

      const upfront = r0(Math.max(0, (inv.finalAmount || 0) - (inv.creditAmount || 0)));
      if (upfront > 0) {
        ledger.push({
          date: new Date(inv.invoiceDate || inv.createdAt),
          order: +new Date(inv.createdAt ?? inv.invoiceDate) + 1,
          kind: 'upfront',
          ref: `تسویه-${inv.invoiceNumber}`,
          desc: `پرداخت نقدی/کارتخوان پای بار فاکتور ${inv.invoiceNumber}`,
          method: inv.paymentMethod ? (METHOD_LABELS[inv.paymentMethod] || inv.paymentMethod) : 'نقدی',
          debit: 0,
          credit: upfront,
          notes: 'تسویه همزمان با خرید بار',
        });
      }
    }

    for (const p of payments) {
      const destText = p.destination ? `به حساب ${p.destination}` : 'به حساب شرکت';
      const accText = p.destinationAccount ? ` (${p.destinationAccount})` : '';
      const desc = `واریز وجه ${destText}${accText}${p.notes ? ` - بابت: ${p.notes}` : ''}`;

      ledger.push({
        date: new Date(p.date),
        order: +new Date(p.createdAt ?? p.date),
        kind: 'payment',
        ref: p.legacyId ? `قدیم-${p.legacyId}` : `واریز-${String(p._id).slice(-6)}`,
        desc,
        method: METHOD_LABELS[p.method] || p.method || 'واریز بانکی',
        debit: 0,
        credit: r0(p.amount || 0),
        notes: p.notes || '',
      });
    }

    ledger.sort((a, b) => +new Date(a.date) - +new Date(b.date) || a.order - b.order);

    const faDate = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' });
    const faTime = new Intl.DateTimeFormat('fa-IR-u-ca-persian', { hour: '2-digit', minute: '2-digit' });
    const toEnDigits = (str: string) => str.replace(/[۰-۹]/g, (d) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)));

    const now = new Date();
    const todayJalali = toEnDigits(faDate.format(now)).replace(/\//g, '-');

    let balance = 0;
    let totalDebit = 0;
    let totalCredit = 0;

    const dataRows = ledger.map((row, idx) => {
      totalDebit += row.debit;
      totalCredit += row.credit;
      balance += row.debit - row.credit;

      const d = row.date;
      const jalaliDateStr = toEnDigits(faDate.format(d));
      const jalaliTimeStr = toEnDigits(faTime.format(d));

      const balanceStatus = balance > 0 ? 'بدهکاریم به شرکت' : balance < 0 ? 'بستانکاریم (طلب/پیش‌پرداخت)' : 'تسویه کامل';

      return [
        idx + 1,
        jalaliDateStr,
        jalaliTimeStr,
        row.kind === 'purchase' ? 'فاکتور خرید بار' : row.kind === 'upfront' ? 'پرداخت پای بار' : 'واریز وجه',
        row.ref,
        row.desc,
        row.method,
        row.debit || '',
        row.credit || '',
        balance,
        balanceStatus,
        row.notes,
      ];
    });

    const finalBalance = balance;
    const finalBalanceLabel = finalBalance > 0
      ? `بدهی فعلی ما به شرکت: ${finalBalance.toLocaleString('en-US')} تومان`
      : finalBalance < 0
      ? `طلب فعلی ما از شرکت (پیش‌پرداخت): ${Math.abs(finalBalance).toLocaleString('en-US')} تومان`
      : 'حساب کاملاً تسویه است (مغایرت صفر)';

    const headSummary = [
      ['صورت‌حساب مالی و مغایرت‌گیری شرکت', isParent ? `${supplier} (شرکت مادر)` : supplier],
      ['تاریخ استخراج گزارش', `${toEnDigits(faDate.format(now))} ساعت ${toEnDigits(faTime.format(now))}`],
      ['تلفن و اطلاعات تماس', company?.phone || company?.contactName || '—'],
      ['تعداد اسناد خرید', supplierInvoices.length],
      ['تعداد واریزی‌ها', payments.length],
      ['جمع کل مبالغ فاکتورهای خرید (بدهکار)', totalDebit],
      ['جمع کل مبالغ واریز شده و تسویه (بستانکار)', totalCredit],
      ['مانده نهایی حساب (جهت تطبیق مغایرت)', finalBalance],
      ['وضعیت نهایی حساب', finalBalanceLabel],
      [], // Empty row before table
    ];

    const tableHeaders = [
      'ردیف',
      'تاریخ',
      'ساعت',
      'نوع سند',
      'شماره سند / فاکتور',
      'شرح تراکنش و اقلام بار / حساب مقصد',
      'روش پرداخت',
      'بدهکار (تومان)',
      'بستانکار (تومان)',
      'مانده حساب (تومان)',
      'وضعیت مانده',
      'توضیحات',
    ];

    const totalRow = [
      'جمع کل',
      '',
      '',
      '',
      '',
      '',
      '',
      totalDebit,
      totalCredit,
      finalBalance,
      finalBalanceLabel,
      '',
    ];

    const csvCell = (v: any) => {
      if (v === null || v === undefined) return '';
      const s = String(v).replace(/"/g, '""');
      return /[",\n\r]/.test(s) ? `"${s}"` : s;
    };

    const csvLines = [
      ...headSummary.map((r) => r.map(csvCell).join(',')),
      tableHeaders.map(csvCell).join(','),
      ...dataRows.map((r) => r.map(csvCell).join(',')),
      totalRow.map(csvCell).join(','),
    ];

    const csv = '\uFEFF' + csvLines.join('\r\n') + '\r\n';
    const safeSupplier = supplier.replace(/[/\\?%*:|"<> ]/g, '_');
    const filename = `صورت‌حساب_مغایرت_${safeSupplier}_${todayJalali}.csv`;

    return { csv, filename };
  }
}
