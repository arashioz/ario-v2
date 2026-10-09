import {
  Injectable,
  NotFoundException,
  Logger,
  OnModuleInit,
  BadRequestException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { Product, ProductDocument } from './schemas/product.schema';
import { StockCount, StockCountDocument } from './schemas/stock-count.schema';
import { SettingsService } from '../settings/settings.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import {
  UpdatePriceDto,
  UpdateStockDto,
  BulkPriceUpdateDto,
  ApplyStockCountDto,
} from './dto/product-operations.dto';

const IMAGE_DIR = join(process.cwd(), 'uploads', 'products');
const IMAGE_NAME = /^[a-f0-9]{24}-[A-Za-z0-9_-]+\.(jpg|png|webp)$/;

/** Detects the image type from magic bytes; the client-sent mimetype is not trusted. */
function imageExt(buf: Buffer): 'jpg' | 'png' | 'webp' | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

const shownPrice = (tier: number | undefined, fallback: number) => (tier && tier > 0 ? tier : fallback);

const roundMoney = (n: number, step?: number) => {
  const s = step && step > 1 ? step : 1;
  return Math.round(n / s) * s;
};

export interface BulkPricePreview {
  name: string;
  unit: string;
  buy: number;
  stock: number;
  before: number;
  after: number;
  beforeSupermarket: number;
  afterSupermarket: number;
  beforeWholesale: number;
  afterWholesale: number;
  /** Retail profit per stock unit, before and after the change. */
  profitBefore: number;
  profitAfter: number;
  skipped?: string;
}

/** Prices the shop actually sells at (tiers), not the unused base field alone. */
function quoteBulkPrices(prod: Product, dto: BulkPriceUpdateDto) {
  const before = shownPrice(prod.priceRetail, prod.sellPrice);
  const beforeSupermarket = shownPrice(prod.priceSupermarket, before);
  const beforeWholesale = shownPrice(prod.priceWholesale, before);
  const buy = prod.buyPrice || 0;
  const stock = prod.stock || 0;
  const step = dto.roundTo ?? 1000;
  const profitBefore = before - buy;
  const base = {
    buy,
    stock,
    before,
    after: before,
    beforeSupermarket,
    afterSupermarket: beforeSupermarket,
    beforeWholesale,
    afterWholesale: beforeWholesale,
    profitBefore,
    profitAfter: profitBefore,
    changed: false,
    skipped: undefined as string | undefined,
    reason: '',
  };

  if (dto.type === 'profit') {
    if (buy <= 0) return { ...base, skipped: 'قیمت خرید ندارد' };
    const after = Math.max(roundMoney(buy * (1 + dto.value / 100), step), buy);
    const superRatio = before > 0 ? beforeSupermarket / before : 1;
    const wholeRatio = before > 0 ? beforeWholesale / before : 1;
    const afterSupermarket = Math.max(roundMoney(after * superRatio, step), buy);
    const afterWholesale = Math.max(roundMoney(after * wholeRatio, step), buy);
    const changed = after !== before || afterSupermarket !== beforeSupermarket || afterWholesale !== beforeWholesale;
    return {
      ...base,
      after,
      afterSupermarket,
      afterWholesale,
      profitAfter: after - buy,
      changed,
      skipped: undefined,
      reason: `سود ${dto.value}٪ روی قیمت خرید`,
    };
  }

  const apply = (n: number) => {
    const raw = dto.type === 'percentage' ? n * (1 + dto.value / 100) : n + dto.value;
    return Math.max(0, roundMoney(raw, step));
  };
  const after = apply(before);
  const afterSupermarket = apply(beforeSupermarket);
  const afterWholesale = apply(beforeWholesale);
  const changed = after !== before || afterSupermarket !== beforeSupermarket || afterWholesale !== beforeWholesale;
  return {
    ...base,
    after,
    afterSupermarket,
    afterWholesale,
    profitAfter: after - buy,
    changed,
    skipped: undefined,
    reason: `تغییر گروهی قیمت (${dto.value}${dto.type === 'percentage' ? '%' : ' تومان'})`,
  };
}

const kgPerUnit = (p: Pick<Product, 'weightPerUnitKg' | 'hasDualUnit' | 'secondaryUnit' | 'unitRatio' | 'unit'>) =>
  p.weightPerUnitKg ||
  (p.hasDualUnit && p.secondaryUnit === 'کیلوگرم' ? p.unitRatio || 0 : 0) ||
  (p.unit === 'کیلوگرم' ? 1 : 0);

export type CatalogTier = 'retail' | 'supermarket' | 'wholesale';

@Injectable()
export class ProductsService implements OnModuleInit {
  private readonly logger = new Logger(ProductsService.name);

  constructor(
    @InjectModel(Product.name)
    private productModel: Model<ProductDocument>,
    @InjectModel(StockCount.name)
    private stockCountModel: Model<StockCountDocument>,
    private settings: SettingsService,
  ) {}

  async onModuleInit() {
    await this.seedInitialProducts();
  }

  private async seedInitialProducts() {
    try {
      const count = await this.productModel.countDocuments();
      if (count === 0) {
        this.logger.log('Seeding initial products for Ario store...');

        const sampleProducts = [
          {
            name: 'برنج طارم هاشمی درجه یک (کیسه ۱۰ کیلویی)',
            barcode: '6260123456781',
            category: 'خواربار و برنج',
            unit: 'کیسه',
            buyPrice: 950000,
            sellPrice: 1180000,
            stock: 24,
            minStockAlert: 5,
            description: 'برنج معطر گیلان محصول امسال',
          },
          {
            name: 'روغن آفتابگردان ۱.۵ لیتری لادن',
            barcode: '6260123456782',
            category: 'روغن و چربی‌ها',
            unit: 'بطری',
            buyPrice: 98000,
            sellPrice: 125000,
            stock: 3, // Low stock on purpose for testing alerts!
            minStockAlert: 10,
            description: 'تصفیه شده با ویتامین D',
          },
          {
            name: 'رب گوجه فرنگی ۸۰۰ گرمی روژین',
            barcode: '6260123456783',
            category: 'کنسرو و رب',
            unit: 'قوطی',
            buyPrice: 52000,
            sellPrice: 68000,
            stock: 45,
            minStockAlert: 8,
            description: 'قوطی کلیددار درجه یک',
          },
          {
            name: 'چای سیاه شکسته ممتاز سیلان ۵۰۰ گرمی',
            barcode: '6260123456784',
            category: 'نوشیدنی و چای',
            unit: 'بسته',
            buyPrice: 210000,
            sellPrice: 265000,
            stock: 18,
            minStockAlert: 6,
            description: 'طعم و عطر طبیعی بدون اسانس',
          },
          {
            name: 'ماکارونی ۷۰۰ گرمی زر ماکارون ۱.۲',
            barcode: '6260123456785',
            category: 'خواربار و برنج',
            unit: 'بسته',
            buyPrice: 24000,
            sellPrice: 31000,
            stock: 4, // Low stock on purpose!
            minStockAlert: 12,
            description: 'غنی شده با فیبر و ویتامین',
          },
          {
            name: 'پنیر سفید قالبی ۴۰۰ گرمی پگاه',
            barcode: '6260123456786',
            category: 'لبنیات',
            unit: 'قوطی',
            buyPrice: 42000,
            sellPrice: 53000,
            stock: 22,
            minStockAlert: 6,
            description: 'پاستوریزه و هموژنیزه',
          },
          {
            name: 'مایع ظرفشویی ۴ لیتری پریل لیمویی',
            barcode: '6260123456787',
            category: 'شوینده و بهداشتی',
            unit: 'گالن',
            buyPrice: 145000,
            sellPrice: 189000,
            stock: 15,
            minStockAlert: 4,
            description: 'قدرت چربی‌زدایی بالا',
          },
        ];

        for (const item of sampleProducts) {
          await this.productModel.create({
            ...item,
            isActive: true,
            priceHistory: [
              {
                oldPrice: Math.round(item.sellPrice * 0.9),
                newPrice: item.sellPrice,
                reason: 'قیمت پایه اولیه سیستم',
                changedByName: 'سیستم آریو',
                date: new Date(),
              },
            ],
          });
        }

        this.logger.log('Initial sample products seeded successfully.');
      }

      const dualUnitCount = await this.productModel.countDocuments({ hasDualUnit: true });
      if (dualUnitCount === 0) {
        this.logger.log('Seeding sample dual-unit nylon products...');
        await this.productModel.create({
          name: 'نایلون عریض درجه یک (طرح ۵)',
          barcode: '626099990001',
          category: 'نایلون و پلاستیک',
          unit: 'بسته',
          hasDualUnit: true,
          secondaryUnit: 'کیلوگرم',
          unitRatio: 3,
          weightPerUnitKg: 3,
          buyPrice: 75000,
          sellPrice: 99000,
          stock: 450,
          minStockAlert: 50,
          description: 'نایلون شفاف ضخیم عرض ۵ - هر بسته دقیقا ۳ کیلوگرم',
          isActive: true,
          priceHistory: [
            {
              oldPrice: 90000,
              newPrice: 99000,
              reason: 'قیمت پایه اولیه سیستم',
              changedByName: 'سیستم آریو',
              date: new Date(),
            },
          ],
        });

        await this.productModel.create({
          name: 'کیسه نایلون دسته‌دار موزی (سایز بزرگ)',
          barcode: '626099990002',
          category: 'نایلون و پلاستیک',
          unit: 'بسته',
          hasDualUnit: true,
          secondaryUnit: 'کیلوگرم',
          unitRatio: 2.5,
          weightPerUnitKg: 2.5,
          buyPrice: 65000,
          sellPrice: 85000,
          stock: 200,
          minStockAlert: 20,
          description: 'هر بسته معادل ۲.۵ کیلوگرم خالص',
          isActive: true,
          priceHistory: [
            {
              oldPrice: 80000,
              newPrice: 85000,
              reason: 'قیمت پایه اولیه سیستم',
              changedByName: 'سیستم آریو',
              date: new Date(),
            },
          ],
        });
      }
    } catch (err) {
      this.logger.error('Failed to seed products', err);
    }
  }

  async create(createProductDto: CreateProductDto, recordedByName?: string): Promise<ProductDocument> {
    const calculatedWeight =
      createProductDto.weightPerUnitKg ||
      (createProductDto.hasDualUnit && createProductDto.secondaryUnit === 'کیلوگرم'
        ? createProductDto.unitRatio
        : createProductDto.unit === 'کیلوگرم'
        ? 1
        : 0);

    const product = new this.productModel({
      ...createProductDto,
      weightPerUnitKg: calculatedWeight,
      category: createProductDto.category || 'عمومی',
      unit: createProductDto.unit || 'عدد',
      buyPrice: createProductDto.buyPrice || 0,
      stock: createProductDto.stock || 0,
      minStockAlert: createProductDto.minStockAlert ?? 5,
      isActive: true,
      priceHistory: [
        {
          oldPrice: createProductDto.sellPrice,
          newPrice: createProductDto.sellPrice,
          reason: 'تعریف اولیه محصول',
          changedByName: recordedByName || 'کاربر سیستم',
          date: new Date(),
        },
      ],
    });

    return product.save();
  }

  async findAll(query?: {
    search?: string;
    category?: string;
    lowStockOnly?: boolean;
  }): Promise<ProductDocument[]> {
    const filterObj: any = { isActive: true };

    if (query?.category && query.category !== 'all') {
      filterObj.category = query.category;
    }

    if (query?.search && query.search.trim()) {
      const s = query.search.trim();
      filterObj.$or = [
        { name: { $regex: s, $options: 'i' } },
        { barcode: { $regex: s, $options: 'i' } },
        { category: { $regex: s, $options: 'i' } },
        { subcategory: { $regex: s, $options: 'i' } },
      ];
    }

    if (query?.lowStockOnly) {
      filterObj.$expr = { $lte: ['$stock', '$minStockAlert'] };
    }

    return this.productModel.find(filterObj).sort({ updatedAt: -1 }).exec();
  }

  /** Rename a category on every product, or a subcategory inside one category. */
  async renameGroup(opts: { level: 'category' | 'subcategory'; from: string; to: string; parent?: string }) {
    const from = opts.from.trim();
    const to = opts.to.trim();
    if (!from || !to) throw new BadRequestException('نام دسته خالی است');
    if (from === to) return { modified: 0, from, to };

    if (opts.level === 'subcategory') {
      const parent = (opts.parent || '').trim();
      if (!parent) throw new BadRequestException('سردسته مشخص نیست');
      const filter =
        from === 'اصلی'
          ? { isActive: true, category: parent, $or: [{ subcategory: '' }, { subcategory: 'اصلی' }, { subcategory: { $exists: false } }] }
          : { isActive: true, category: parent, subcategory: from };
      const res = await this.productModel.updateMany(filter, { $set: { subcategory: to === 'اصلی' ? '' : to } }).exec();
      return { modified: res.modifiedCount, from, to };
    }

    const res = await this.productModel.updateMany({ isActive: true, category: from }, { $set: { category: to } }).exec();
    const settings = await this.settings.get();
    if ((settings.categoryOrder || []).includes(from)) {
      settings.categoryOrder = settings.categoryOrder.map((c) => (c === from ? to : c));
      await settings.save();
    }
    return { modified: res.modifiedCount, from, to };
  }

  async findOne(id: string): Promise<ProductDocument> {
    const product = await this.productModel.findById(id).exec();
    if (!product || !product.isActive) {
      throw new NotFoundException('کالای مورد نظر یافت نشد');
    }
    return product;
  }

  async update(id: string, updateDto: UpdateProductDto): Promise<ProductDocument> {
    const set: any = { ...updateDto };
    let priceChanged = false;
    if (['sellPrice', 'priceRetail', 'priceSupermarket', 'priceWholesale'].some((k) => (updateDto as any)[k] !== undefined)) {
      const current = await this.productModel.findById(id).select('sellPrice priceRetail priceSupermarket priceWholesale').lean();
      if (current && ['sellPrice', 'priceRetail', 'priceSupermarket', 'priceWholesale'].some((k) => (updateDto as any)[k] !== undefined && (updateDto as any)[k] !== (current as any)[k])) {
        set.priceSetAt = new Date();
        priceChanged = true;
      }
    }
    const product = await this.productModel
      .findByIdAndUpdate(id, { $set: set, ...(priceChanged ? { $unset: { priceCostBasisPerKg: 1 } } : {}) }, { new: true })
      .exec();

    if (!product) {
      throw new NotFoundException('کالا یافت نشد');
    }
    return product;
  }

  async updatePrice(
    id: string,
    dto: UpdatePriceDto,
    recordedByName: string,
  ): Promise<ProductDocument> {
    const product = await this.findOne(id);

    const oldPrice = product.sellPrice;
    product.sellPrice = dto.newSellPrice;
    // The POS prices from the tiers; the retail tier is the base sell price.
    product.priceRetail = dto.newSellPrice;
    if (dto.priceSupermarket !== undefined) product.priceSupermarket = dto.priceSupermarket;
    if (dto.priceWholesale !== undefined) product.priceWholesale = dto.priceWholesale;
    product.priceSetAt = new Date();
    product.priceCostBasisPerKg = dto.costBasisPerKg && dto.costBasisPerKg > 0 ? dto.costBasisPerKg : undefined;

    if (dto.newBuyPrice !== undefined && dto.newBuyPrice >= 0) {
      product.buyPrice = dto.newBuyPrice;
    }

    product.priceHistory.unshift({
      oldPrice,
      newPrice: dto.newSellPrice,
      reason: dto.reason || 'تغییر قیمت پایه کالا',
      changedByName: recordedByName,
      date: new Date(),
    });

    return product.save();
  }

  async saveImage(id: string, file?: { buffer: Buffer }): Promise<ProductDocument> {
    const product = await this.findOne(id);
    if (!file?.buffer?.length) throw new BadRequestException('تصویری دریافت نشد');
    const ext = imageExt(file.buffer);
    if (!ext) throw new BadRequestException('فقط تصویر JPG، PNG یا WEBP قابل قبول است');
    if (!existsSync(IMAGE_DIR)) mkdirSync(IMAGE_DIR, { recursive: true });
    const name = `${product._id}-${randomBytes(6).toString('base64url')}.${ext}`;
    writeFileSync(join(IMAGE_DIR, name), file.buffer);
    this.deleteImageFile(product.image);
    product.image = name;
    return product.save();
  }

  async removeImage(id: string): Promise<ProductDocument> {
    const product = await this.findOne(id);
    this.deleteImageFile(product.image);
    product.image = '';
    return product.save();
  }

  imagePath(name: string) {
    const path = IMAGE_NAME.test(name) ? join(IMAGE_DIR, name) : '';
    if (!path || !existsSync(path)) throw new NotFoundException('تصویر یافت نشد');
    return path;
  }

  private deleteImageFile(name?: string) {
    if (!name || !IMAGE_NAME.test(name)) return;
    try {
      unlinkSync(join(IMAGE_DIR, name));
    } catch {
      /* already gone */
    }
  }

  /** Public price list: no cost prices, exact stock or descriptions (migrated ones embed stock weight). */
  async catalog(tier: CatalogTier = 'retail') {
    const [settings, products] = await Promise.all([
      this.settings.get(),
      this.productModel
        .find({ isActive: true })
        .select('name category subcategory unit hasDualUnit secondaryUnit unitRatio weightPerUnitKg sellPrice priceRetail priceSupermarket priceWholesale stock image updatedAt')
        .sort({ category: 1, subcategory: 1, name: 1 })
        .lean(),
    ]);
    const tierField = tier === 'wholesale' ? 'priceWholesale' : tier === 'supermarket' ? 'priceSupermarket' : 'priceRetail';
    return {
      shopName: settings.shopName,
      shopPhone: settings.shopPhone,
      shopAddress: settings.shopAddress,
      categoryOrder: settings.categoryOrder ?? [],
      tier,
      generatedAt: new Date(),
      products: products.map((p) => {
        const kg = kgPerUnit(p);
        const price = (p as any)[tierField] > 0 ? (p as any)[tierField] : p.sellPrice;
        return {
          _id: p._id,
          name: p.name,
          category: p.category,
          subcategory: p.subcategory || '',
          unit: p.unit,
          weightPerUnitKg: kg,
          price,
          pricePerKg: kg ? Math.round(price / kg) : 0,
          inStock: p.stock > 0,
          image: p.image || '',
          updatedAt: (p as any).updatedAt,
        };
      }),
    };
  }

  /** Sets counted quantities and remembers the difference so a later invoice rebuild does not wipe the count. */
  async applyStockCount(dto: ApplyStockCountDto, recordedByName: string) {
    if (!dto.lines?.length) throw new BadRequestException('کالایی برای ثبت شمارش نیست');
    const lines: { productId: string; name: string; unit: string; systemQty: number; countedQty: number; delta: number }[] = [];
    for (const row of dto.lines) {
      const product = await this.productModel.findById(row.productId).exec();
      if (!product || !product.isActive) continue;
      const countedQty = Math.round(row.countedQty * 1000) / 1000;
      const systemQty = Math.round((product.stock || 0) * 1000) / 1000;
      const delta = Math.round((countedQty - systemQty) * 1000) / 1000;
      if (Math.abs(delta) < 0.0005) continue;
      product.stockAdjust = Math.round(((product.stockAdjust || 0) + delta) * 1000) / 1000;
      product.stock = countedQty;
      await product.save();
      lines.push({ productId: String(product._id), name: product.name, unit: product.unit || '', systemQty, countedQty, delta });
    }
    if (!lines.length) throw new BadRequestException('شمارش با موجودی سیستم یکی است و چیزی برای اصلاح نماند');
    const saved = await this.stockCountModel.create({ lines, createdByName: recordedByName || 'مدیر سیستم' });
    return { id: String(saved._id), changed: lines.length, lines };
  }

  async updateStock(id: string, dto: UpdateStockDto): Promise<ProductDocument> {
    const product = await this.findOne(id);

    const newStock = product.stock + dto.quantityChange;
    if (newStock < 0) {
      throw new BadRequestException('موجودی انبار نمی‌تواند کمتر از صفر باشد');
    }

    product.stock = newStock;
    return product.save();
  }

  async bulkUpdatePrices(
    dto: BulkPriceUpdateDto,
    recordedByName: string,
  ): Promise<
    | { modifiedCount: number; message: string }
    | { preview: true; items: BulkPricePreview[] }
  > {
    const filterObj: any = { isActive: true };
    if (dto.category && dto.category !== 'all') {
      filterObj.category = dto.category;
    }

    const products = await this.productModel.find(filterObj).exec();
    const items: BulkPricePreview[] = [];
    let modifiedCount = 0;

    for (const prod of products) {
      const next = quoteBulkPrices(prod, dto);
      items.push({
        name: prod.name,
        unit: prod.unit,
        buy: next.buy,
        stock: next.stock,
        before: next.before,
        after: next.after,
        beforeSupermarket: next.beforeSupermarket,
        afterSupermarket: next.afterSupermarket,
        beforeWholesale: next.beforeWholesale,
        afterWholesale: next.afterWholesale,
        profitBefore: next.profitBefore,
        profitAfter: next.profitAfter,
        skipped: next.skipped,
      });
      if (dto.preview || next.skipped || !next.changed) continue;

      await this.productModel.updateOne(
        { _id: prod._id },
        {
          $set: {
            sellPrice: next.after,
            priceRetail: next.after,
            priceSupermarket: next.afterSupermarket,
            priceWholesale: next.afterWholesale,
            priceSetAt: new Date(),
          },
          $unset: { priceCostBasisPerKg: 1 },
          $push: {
            priceHistory: {
              $each: [
                {
                  oldPrice: next.before,
                  newPrice: next.after,
                  reason: dto.reason || next.reason,
                  changedByName: recordedByName,
                  date: new Date(),
                },
              ],
              $position: 0,
              $slice: 40,
            },
          },
        },
      );
      modifiedCount++;
    }

    if (dto.preview) return { preview: true, items };

    return {
      modifiedCount,
      message: `قیمت ${modifiedCount} محصول به‌روزرسانی شد.`,
    };
  }

  async getStats(): Promise<{
    totalProducts: number;
    lowStockCount: number;
    totalStockUnits: number;
    inventoryBuyValue: number;
    inventorySellValue: number;
    totalWeightKg: number;
    totalTonnage: number;
    categories: string[];
  }> {
    const products = await this.productModel.find({ isActive: true }).exec();

    let lowStockCount = 0;
    let totalStockUnits = 0;
    let inventoryBuyValue = 0;
    let inventorySellValue = 0;
    let totalWeightKg = 0;
    const categoriesSet = new Set<string>();

    for (const p of products) {
      if (p.category) {
        categoriesSet.add(p.category);
      }
      totalStockUnits += p.stock || 0;
      inventoryBuyValue += (p.buyPrice || 0) * (p.stock || 0);
      inventorySellValue += (p.sellPrice || 0) * (p.stock || 0);

      let unitWeight = p.weightPerUnitKg || 0;
      if (!unitWeight && p.hasDualUnit && p.secondaryUnit === 'کیلوگرم') {
        unitWeight = p.unitRatio || 1;
      } else if (!unitWeight && p.unit === 'کیلوگرم') {
        unitWeight = 1;
      }
      totalWeightKg += (p.stock || 0) * unitWeight;

      if ((p.stock || 0) <= (p.minStockAlert ?? 5)) {
        lowStockCount++;
      }
    }

    return {
      totalProducts: products.length,
      lowStockCount,
      totalStockUnits,
      inventoryBuyValue,
      inventorySellValue,
      totalWeightKg: Math.round(totalWeightKg * 10) / 10,
      totalTonnage: Math.round((totalWeightKg / 1000) * 100) / 100,
      categories: Array.from(categoriesSet),
    };
  }

  async remove(id: string): Promise<{ message: string }> {
    const product = await this.productModel
      .findByIdAndUpdate(id, { isActive: false }, { new: true })
      .exec();

    if (!product) {
      throw new NotFoundException('کالا یافت نشد');
    }
    return { message: 'محصول با موفقیت حذف گردید' };
  }
}
