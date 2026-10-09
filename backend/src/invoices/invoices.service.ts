import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import * as bcrypt from 'bcrypt';
import { Invoice, InvoiceDocument } from './schemas/invoice.schema';
import { CreateInvoiceDto, InvoiceItemDto } from './dto/create-invoice.dto';
import { Product, ProductDocument } from '../products/schemas/product.schema';
import { Customer, CustomerDocument } from '../customers/schemas/customer.schema';
import { CustomersService } from '../customers/customers.service';
import { UsersService } from '../users/users.service';
import { SuppliersService } from '../suppliers/suppliers.service';
import { canonicalSupplier, PARENT_COMPANY } from '../suppliers/supplier-names';
import { Expense, ExpenseDocument } from '../expenses/schemas/expense.schema';
import { SettingsService } from '../settings/settings.service';

interface ActingUser {
  id?: string;
  username?: string;
  fullName?: string;
}

@Injectable()
export class InvoicesService {
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
  ) {}

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

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

  /** Add `sign * quantity` of every item to stock. */
  private async shiftStock(items: { productId: string; quantity: number; received?: boolean }[], sign: 1 | -1, purchase = false) {
    for (const item of this.inShop(items, purchase)) {
      if (!Types.ObjectId.isValid(item.productId)) continue;
      await this.productModel
        .updateOne({ _id: item.productId }, { $inc: { stock: sign * (item.quantity || 0) } })
        .exec();
    }
  }

  private async prepareItems(items: InvoiceItemDto[], isSale: boolean) {
    let totalWeightKg = 0;
    const prepared: any[] = [];

    for (const item of items) {
      const product = await this.productModel.findById(item.productId).exec();
      if (!product) {
        if (isSale) throw new NotFoundException(`کالای «${item.productName}» یافت نشد.`);
        const weight = item.weightKg || item.secondaryQuantity || 0;
        totalWeightKg += weight;
        prepared.push({ ...item, weightKg: Math.round(weight * 10) / 10, received: item.received !== false });
        continue;
      }
      if (isSale && product.stock < item.quantity) {
        throw new BadRequestException(
          `موجودی «${product.name}» کافی نیست (موجودی: ${product.stock} ${product.unit}، درخواستی: ${item.quantity})`,
        );
      }

      let weight = item.weightKg || 0;
      if (!weight) {
        if (item.secondaryUnit === 'کیلوگرم' && item.secondaryQuantity) weight = item.secondaryQuantity;
        else if (product.weightPerUnitKg) weight = item.quantity * product.weightPerUnitKg;
        else if (product.unit === 'کیلوگرم') weight = item.quantity;
      }
      totalWeightKg += weight;
      prepared.push({
        ...item,
        weightKg: Math.round(weight * 10) / 10,
        received: isSale ? true : item.received !== false,
        factoryUnitCost: isSale ? Math.max(0, Math.round(Number(item.factoryUnitCost) || 0)) : 0,
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
    if (!dto.customerId || !Types.ObjectId.isValid(dto.customerId)) return null;
    return this.customerModel.findById(dto.customerId).exec();
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
    const needed = invoice.shippingPayer === 'me' && invoice.shippingCost > 0;
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

  /**
   * Direct factory sale: the parent company invoiced Ario, the goods never entered the shop,
   * and the customer invoice is what Ario sends. Stock is untouched on both sides.
   */
  private async attachFactoryPurchase(sale: InvoiceDocument, recordedByName: string) {
    const items = (sale.items || []).map((it) => {
      const unitPrice = Math.max(0, Math.round(it.factoryUnitCost || 0));
      return {
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
      };
    });
    const total = items.reduce((s, it) => s + it.totalPrice, 0);
    const fields = {
      type: 'purchase',
      saleType: 'wholesale',
      customerName: PARENT_COMPANY,
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
      notes: `ارسال مستقیم از کارخانه برای فاکتور ${sale.invoiceNumber}. از موجودی آریو کم نشده.`,
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
    await this.suppliersService.sync(PARENT_COMPANY);
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
      if (src && String(src.productId) === String(it.productId)) {
        it.factoryUnitCost = Math.max(0, Math.round(src.unitPrice || 0));
      }
    });
    sale.markModified('items');
    await sale.save();
    await this.attachFactoryPurchase(sale, purchase.createdByName || '');
  }

  /** 403, not 401: the client treats 401 as an expired session and logs the user out. */
  private async verifyPassword(user: ActingUser, password?: string) {
    if (!password) throw new ForbiddenException('برای حذف، رمز عبور خود را وارد کنید');
    const account = user.username ? await this.usersService.findByUsername(user.username) : null;
    if (!account || !(await bcrypt.compare(password, account.password))) {
      throw new ForbiddenException('رمز عبور اشتباه است');
    }
  }

  // ---------------------------------------------------------------------------
  // CRUD
  // ---------------------------------------------------------------------------

  async create(
    dto: CreateInvoiceDto,
    recordedByName: string,
    extra: { proformaNumber?: string; shippedAt?: Date } = {},
  ): Promise<InvoiceDocument> {
    const isSale = (dto.type || 'sale') === 'sale';
    const fromFactory = isSale && dto.fulfillment === 'factory';
    if (fromFactory) await this.assertFactoryEnabled();
    const { items, totalWeightKg } = await this.prepareItems(dto.items, isSale && !fromFactory);
    const customer = isSale ? await this.resolveCustomer(dto) : null;
    // Purchases on credit go on the supplier's account (see SuppliersService).
    const credit = this.creditPortion(dto);

    if (isSale && credit > 0 && !customer) {
      throw new BadRequestException('برای فروش نسیه، مشتری را انتخاب کنید');
    }

    if (isSale && !fromFactory) {
      await this.shiftStock(items, -1);
    } else if (!isSale && dto.fulfillment !== 'factory') {
      await this.shiftStock(items, 1, true);
      for (const item of items) {
        if (item.unitPrice > 0 && dto.fulfillment !== 'factory') {
          await this.productModel.updateOne({ _id: item.productId }, { $set: { buyPrice: item.unitPrice } }).exec();
        }
      }
    }

    const customerPrevBalance = customer?.balance || 0;
    const invoiceDate = dto.invoiceDate ? new Date(dto.invoiceDate) : new Date();
    const dueDays = credit > 0 ? Math.min(365, Math.max(0, Math.round(dto.dueDays ?? 15))) : 15;
    const invoice = new this.invoiceModel({
      invoiceNumber: await this.nextInvoiceNumber(isSale),
      type: dto.type || 'sale',
      saleType: dto.saleType || 'retail',
      customerId: customer ? customer._id : undefined,
      customerName: customer?.name || (isSale ? dto.customerName : canonicalSupplier(dto.customerName)),
      customerPhone: customer?.phoneNumber || dto.customerPhone || '',
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
      shippedAt: extra.shippedAt,
      createdByName: recordedByName || 'مدیر سیستم',
    });
    await invoice.save();
    await this.syncShippingExpense(invoice, recordedByName);
    if (fromFactory) await this.attachFactoryPurchase(invoice, recordedByName);

    if (isSale && credit > 0 && customer) {
      invoice.customerNewBalance = await this.customersService.addInvoiceDebt(invoice, recordedByName);
      await invoice.save();
      await this.customersService.alignInvoiceDebts(String(customer._id));
      return this.findById(String(invoice._id));
    }
    if (!isSale) {
      await this.suppliersService.sync(invoice.customerName);
      return this.findById(String(invoice._id));
    }
    return invoice;
  }

  async update(id: string, dto: CreateInvoiceDto, recordedByName: string): Promise<InvoiceDocument> {
    const invoice = await this.findById(id);
    const isSale = invoice.type === 'sale';
    const wasFactory = invoice.fulfillment === 'factory';
    const willFactory = (dto.fulfillment ?? invoice.fulfillment) === 'factory';
    const wasShopSale = isSale && !wasFactory;
    const wasShopPurchase = !isSale && !wasFactory;
    const willShopSale = isSale && !willFactory;
    const willShopPurchase = !isSale && !willFactory;
    if (isSale && willFactory && !wasFactory) await this.assertFactoryEnabled();

    // Undo the old effects, then apply the new ones; restore on validation failure.
    if (wasShopSale) await this.shiftStock(invoice.items as any, 1);
    else if (wasShopPurchase) await this.shiftStock(invoice.items as any, -1, true);
    let prepared: Awaited<ReturnType<InvoicesService['prepareItems']>>;
    try {
      prepared = await this.prepareItems(dto.items, willShopSale);
    } catch (err) {
      if (wasShopSale) await this.shiftStock(invoice.items as any, -1);
      else if (wasShopPurchase) await this.shiftStock(invoice.items as any, 1, true);
      throw err;
    }
    if (willShopSale) await this.shiftStock(prepared.items, -1);
    else if (willShopPurchase) await this.shiftStock(prepared.items, 1, true);

    const customer = isSale ? await this.resolveCustomer(dto) : null;
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
    const invoiceDate = dto.invoiceDate ? new Date(dto.invoiceDate) : invoice.invoiceDate;
    const dueDays = credit > 0 ? Math.min(365, Math.max(0, Math.round(dto.dueDays ?? invoice.dueDays ?? 15))) : invoice.dueDays;
    invoice.set({
      saleType: dto.saleType || invoice.saleType,
      customerId: customer ? customer._id : undefined,
      customerName: customer?.name || (isSale ? dto.customerName : dto.customerName && canonicalSupplier(dto.customerName)) || invoice.customerName,
      customerPhone: customer?.phoneNumber || dto.customerPhone || '',
      invoiceDate,
      fulfillment: dto.fulfillment ?? invoice.fulfillment ?? 'shop',
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
    });
    await invoice.save();
    await this.syncShippingExpense(invoice, recordedByName);
    if (isSale && willFactory) await this.attachFactoryPurchase(invoice, recordedByName);
    else if (isSale && wasFactory) await this.detachFactoryPurchase(invoice);

    if (!isSale) {
      if (invoice.fulfillment === 'factory' && invoice.factorySaleId) {
        await this.mirrorFactoryCostToSale(invoice);
      }
      for (const item of prepared.items) {
        if (willShopPurchase && item.unitPrice > 0 && Types.ObjectId.isValid(String(item.productId))) {
          await this.productModel.updateOne({ _id: item.productId }, { $set: { buyPrice: item.unitPrice } }).exec();
        }
      }
      await this.suppliersService.sync(invoice.customerName);
      if (canonicalSupplier(previousSupplier) !== canonicalSupplier(invoice.customerName)) {
        await this.suppliersService.sync(previousSupplier);
      }
      return this.findById(id);
    }
    if (credit > 0 && customer) {
      invoice.customerNewBalance = await this.customersService.addInvoiceDebt(invoice, recordedByName);
      await invoice.save();
    }
    if (customer) await this.customersService.alignInvoiceDebts(String(customer._id));
    return this.findById(id);
  }

  async remove(id: string, user: ActingUser, password?: string): Promise<{ message: string }> {
    await this.verifyPassword(user, password);
    const invoice = await this.findById(id);
    const isSale = invoice.type === 'sale';
    const fromFactory = invoice.fulfillment === 'factory';

    if (isSale && fromFactory) await this.detachFactoryPurchase(invoice);
    else if (!isSale && invoice.factorySaleId && Types.ObjectId.isValid(invoice.factorySaleId)) {
      await this.invoiceModel.updateOne({ _id: invoice.factorySaleId }, { $set: { factoryPurchaseId: '', factoryPurchaseNumber: '' } }).exec();
    }

    if (isSale && !fromFactory) await this.shiftStock(invoice.items as any, 1);
    else if (!isSale && !fromFactory) await this.shiftStock(invoice.items as any, -1, true);
    if (invoice.shippingExpenseId && Types.ObjectId.isValid(invoice.shippingExpenseId)) {
      await this.expenseModel.deleteOne({ _id: invoice.shippingExpenseId }).exec();
    }
    await invoice.deleteOne();
    if (isSale) {
      await this.customersService.removeInvoiceDebt(invoice, true);
      if (invoice.customerId) await this.customersService.alignInvoiceDebts(String(invoice.customerId));
    } else {
      await this.suppliersService.sync(invoice.customerName);
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
    return this.findById(id);
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

  async findAll(query?: {
    type?: string;
    saleType?: string;
    customerId?: string;
    search?: string;
    isPaid?: string;
  }): Promise<InvoiceDocument[]> {
    await this.customersService.ensureReconciled();
    const filter: any = {};

    if (query?.type) filter.type = query.type;
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

    return this.invoiceModel.find(filter).sort({ invoiceDate: -1, createdAt: -1 }).exec();
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
      .find({ type: 'sale' }, { finalAmount: 1, totalWeightKg: 1, invoiceDate: 1, createdAt: 1 })
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
      const amount = inv.finalAmount || 0;
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

  /**
   * Rewrite every product's stock from invoices.
   * Purchases count only when the goods were received. Sales count only when they left Ario stock.
   */
  async rebuildStock() {
    const invoices = await this.invoiceModel
      .find({ type: { $in: ['sale', 'purchase'] } })
      .select('type fulfillment items')
      .lean()
      .exec();

    const totals = new Map<string, number>();
    let purchases = 0;
    let sales = 0;
    for (const inv of invoices) {
      const purchase = inv.type === 'purchase';
      if (inv.fulfillment === 'factory') continue;
      if (purchase) purchases++;
      else sales++;
      for (const item of inv.items || []) {
        const productId = String(item.productId || '');
        if (!Types.ObjectId.isValid(productId)) continue;
        if (purchase && item.received === false) continue;
        totals.set(productId, (totals.get(productId) || 0) + (purchase ? 1 : -1) * (item.quantity || 0));
      }
    }

    const products = await this.productModel.find().select('_id stock').lean().exec();
    const writes: { updateOne: { filter: { _id: unknown }; update: { $set: { stock: number } } } }[] = [];
    for (const product of products) {
      const id = String(product._id);
      if (!totals.has(id)) continue;
      const stock = Math.round((totals.get(id) || 0) * 1000) / 1000;
      if (Math.abs((product.stock || 0) - stock) < 0.0005) continue;
      writes.push({ updateOne: { filter: { _id: product._id }, update: { $set: { stock } } } });
    }
    if (writes.length) await this.productModel.bulkWrite(writes);
    return { changed: writes.length, products: totals.size, purchases, sales };
  }
}
