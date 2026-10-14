import { spawn, ChildProcess } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { Connection, createConnection, Model } from 'mongoose';
import { randomUUID } from 'crypto';
import {
  Product,
  ProductDocument,
  ProductSchema,
} from '../products/schemas/product.schema';
import {
  WorkshopBatch,
  WorkshopBatchDocument,
  WorkshopBatchSchema,
} from './workshop.schema';
import { WorkshopService } from './workshop.service';
import { CreateWorkshopDto } from './workshop.dto';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { ProductsService } from '../products/products.service';
import {
  Invoice,
  InvoiceDocument,
  InvoiceSchema,
} from '../invoices/schemas/invoice.schema';
import { InvoicesService } from '../invoices/invoices.service';
import { OrderRequestsService } from '../orders/order-requests.service';
import { OrderRequestSchema } from '../orders/order-requests.module';
import { AppSettings, AppSettingsSchema } from '../settings/schemas/app-settings.schema';
import { SettingsService } from '../settings/settings.service';
import { CreateInvoiceDto } from '../invoices/dto/create-invoice.dto';

// Real standalone MongoDB exercises conditional stock writes and failure recovery.
// Supply MONGOD_BINARY when mongod is not on PATH. No application database is used.
describe('Workshop production (standalone MongoDB)', () => {
  let mongod: ChildProcess;
  let dir: string;
  let connection: Connection;
  let products: Model<Product>;
  let batches: Model<WorkshopBatch>;
  let invoices: Model<Invoice>;
  let service: WorkshopService;
  let dto: CreateWorkshopDto;
  let material: ProductDocument;
  let packaging: ProductDocument;
  let output: ProductDocument;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'ario-workshop-test-'));
    // Port 0 lets MongoDB choose a free port; parse its ready message.
    mongod = spawn(process.env.MONGOD_BINARY || 'mongod', [
      '--dbpath',
      dir,
      '--bind_ip',
      '127.0.0.1',
      '--port',
      '0',
      '--nounixsocket',
    ]);
    const port = await new Promise<number>((resolve, reject) => {
      let text = '';
      const timeout = setTimeout(
        () => reject(new Error('Test MongoDB did not start')),
        15000,
      );
      mongod.on('error', (err) => {
        clearTimeout(timeout);
        reject(err);
      });
      mongod.on('exit', (code) => {
        clearTimeout(timeout);
        reject(new Error(`Test MongoDB exited: ${code}; ${text.slice(-1000)}`));
      });
      mongod.stdout!.on('data', (chunk) => {
        text += chunk;
        for (const line of String(chunk).split('\n')) {
          try {
            const event = JSON.parse(line);
            if (event.msg === 'Waiting for connections') {
              clearTimeout(timeout);
              resolve(event.attr.port);
            }
          } catch {
            /* incomplete line */
          }
        }
      });
    });
    connection = await createConnection(
      `mongodb://127.0.0.1:${port}/workshop_test`,
    ).asPromise();
    products = connection.model(Product.name, ProductSchema);
    batches = connection.model(WorkshopBatch.name, WorkshopBatchSchema);
    invoices = connection.model(Invoice.name, InvoiceSchema);
    service = new WorkshopService(
      products as unknown as Model<ProductDocument>,
      batches as unknown as Model<WorkshopBatchDocument>,
      invoices as unknown as Model<InvoiceDocument>,
    );
    await service.onModuleInit();
  }, 20000);

  afterAll(async () => {
    await connection?.close();
    if (mongod && mongod.exitCode === null)
      await new Promise<void>((resolve) => {
        mongod.once('exit', () => resolve());
        mongod.kill('SIGTERM');
      });
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  beforeEach(async () => {
    await products.deleteMany({});
    await batches.deleteMany({});
    await invoices.deleteMany({});
    material = await products.create({
      name: 'نبات',
      unit: 'کیلوگرم',
      weightPerUnitKg: 1,
      stock: 10,
      openingStock: 10,
      buyPrice: 100,
      sellPrice: 120,
    });
    packaging = await products.create({
      name: 'پاکت',
      unit: 'عدد',
      stock: 20,
      openingStock: 20,
      buyPrice: 5,
      sellPrice: 10,
    });
    output = await products.create({
      name: 'نبات بسته‌بندی',
      unit: 'بسته',
      weightPerUnitKg: 0.5,
      stock: 2,
      openingStock: 2,
      buyPrice: 60,
      sellPrice: 80,
    });
    dto = {
      requestId: randomUUID(),
      inputs: [
        { productId: String(material._id), quantity: 2 },
        { productId: String(packaging._id), quantity: 4 },
      ],
      outputProductId: String(output._id),
      outputCategory: 'نبات و قند',
      outputQuantity: 4,
      packagingCost: 20,
      laborCost: 40,
      sellPrice: 100,
    };
  });

  it('converts stock, records per-unit costs and adjustments, and never deducts a retry twice', async () => {
    const result = await service.create(dto, 'آزمایش');
    expect(result.status).toBe('completed');
    expect(result.totalCost).toBe(280);
    expect(result.output.unitCost).toBe(70);
    expect(await products.findById(material._id)).toMatchObject({
      stock: 8,
      stockAdjust: -2,
    });
    expect(await products.findById(output._id)).toMatchObject({
      stock: 6,
      stockAdjust: 4,
      buyPrice: 70,
      sellPrice: 100,
      priceRetail: 100,
      category: 'نبات و قند',
    });
    expect((await service.create(dto, 'آزمایش'))._id).toEqual(result._id);
    expect((await products.findById(material._id))!.stock).toBe(8);
    expect(await batches.countDocuments()).toBe(1);
    expect(result.output.category).toBe('نبات و قند');
    expect(
      await products.countDocuments({ workshopPending: String(result._id) }),
    ).toBe(0);
  });

  it('requires an output category before deducting any inventory', async () => {
    await expect(service.create({ ...dto, outputCategory: '  ' }, 'test'))
      .rejects.toThrow('دسته‌بندی');
    expect(await batches.countDocuments()).toBe(0);
    expect((await products.findById(material._id))!.stock).toBe(10);
    expect((await products.findById(output._id))!.stock).toBe(2);
    const errors = await validate(plainToInstance(CreateWorkshopDto, { ...dto, outputCategory: '  ' }));
    expect(errors.some((error) => error.property === 'outputCategory')).toBe(true);
  });

  it('rejects insufficient stock, repeated materials and self-conversion without writes', async () => {
    await expect(
      service.create(
        { ...dto, inputs: [{ productId: String(material._id), quantity: 11 }] },
        'test',
      ),
    ).rejects.toThrow('کافی نیست');
    await expect(
      service.create(
        { ...dto, inputs: [dto.inputs[0], dto.inputs[0]] },
        'test',
      ),
    ).rejects.toThrow('یک بار');
    await expect(
      service.create({ ...dto, outputProductId: String(material._id) }, 'test'),
    ).rejects.toThrow('متفاوت');
    expect(await batches.countDocuments()).toBe(0);
    expect((await products.findById(material._id))!.stock).toBe(10);
  });

  it('rolls back earlier deductions when a later stock write fails', async () => {
    const original = products.updateOne.bind(products);
    const spy = jest
      .spyOn(products, 'updateOne')
      .mockImplementationOnce(
        (...args: any[]) => original(...(args as [any, any])) as any,
      )
      .mockImplementationOnce(() => {
        throw new Error('simulated write failure');
      });
    await expect(service.create(dto, 'test')).rejects.toThrow('simulated');
    spy.mockRestore();
    expect((await products.findById(material._id))!.stock).toBe(10);
    expect((await products.findById(output._id))!.stock).toBe(2);
    expect((await batches.findOne())!.status).toBe('cancelled');
  });

  it('allows only one of two concurrent batches to use the last stock', async () => {
    const input = {
      ...dto,
      inputs: [{ productId: String(material._id), quantity: 8 }],
    };
    const results = await Promise.allSettled([
      service.create(input, 'test'),
      service.create({ ...input, requestId: randomUUID() }, 'test'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect((await products.findById(material._id))!.stock).toBe(2);
    expect((await products.findById(output._id))!.stock).toBe(6);
  });

  it('recovers a committed output after status persistence fails', async () => {
    const spy = jest.spyOn(batches, 'updateOne').mockImplementationOnce(() => {
      throw new Error('lost status write');
    });
    await expect(service.create(dto, 'test')).rejects.toThrow('lost status');
    spy.mockRestore();
    await service.onModuleInit();
    expect((await batches.findOne())!.status).toBe('completed');
    expect((await products.findById(output._id))!.stock).toBe(6);
    await service.create(dto, 'test');
    expect((await products.findById(material._id))!.stock).toBe(8);
  });

  it('recovers an interrupted rollback after restart', async () => {
    const original = products.updateOne.bind(products);
    const spy = jest
      .spyOn(products, 'updateOne')
      .mockImplementationOnce(
        (...args: any[]) => original(...(args as [any, any])) as any,
      )
      .mockImplementationOnce(() => {
        throw new Error('input failure');
      })
      .mockImplementationOnce(() => {
        throw new Error('rollback connection lost');
      });
    await expect(service.create(dto, 'test')).rejects.toThrow('rollback');
    spy.mockRestore();
    await service.onModuleInit();
    expect((await products.findById(material._id))!.stock).toBe(10);
    expect((await batches.findOne())!.status).toBe('cancelled');
    await service.onModuleInit();
    expect((await products.findById(material._id))!.stock).toBe(10);
  });

  it('recovers a lost completion response on retry without requiring a restart', async () => {
    const spy = jest.spyOn(batches, 'updateOne').mockImplementationOnce(() => {
      throw new Error('lost response');
    });
    await expect(service.create(dto, 'test')).rejects.toThrow('lost response');
    spy.mockRestore();
    expect((await service.create(dto, 'test')).status).toBe('completed');
    expect((await products.findById(material._id))!.stock).toBe(8);
    expect((await products.findById(output._id))!.stock).toBe(6);
  });

  it('validates quantities, IDs, costs and nested inputs', async () => {
    for (const change of [
      { outputQuantity: 0 },
      { laborCost: -1 },
      { sellPrice: NaN },
      { outputProductId: 'bad' },
      { inputs: [] },
      { inputs: [{ productId: String(material._id), quantity: -1 }] },
    ]) {
      expect(
        (
          await validate(
            plainToInstance(CreateWorkshopDto, { ...dto, ...change }),
          )
        ).length,
      ).toBeGreaterThan(0);
    }
    expect(
      await validate(plainToInstance(CreateWorkshopDto, dto)),
    ).toHaveLength(0);
  });

  it('serves fresh produced stock to POS without histories or internal markers', async () => {
    await service.create(dto, 'test');
    await products.updateOne({ _id: output._id }, { $set: {
      description: 'Internal description', workshopPending: ['private-marker'],
    } });
    await products.updateOne({ _id: packaging._id }, { $set: { isActive: false } });
    const catalog = new ProductsService(products as unknown as Model<ProductDocument>, null, null);
    const managed = await catalog.findAll({ category: dto.outputCategory });
    expect(managed).toHaveLength(1);
    expect(String(managed[0]._id)).toBe(String(output._id));
    expect(managed[0].stock).toBe(6);
    const list = await catalog.findForSale();
    expect(list).toHaveLength(2);
    const row = list.find((p) => String(p._id) === String(output._id));
    expect(row).toMatchObject({ stock: 6, buyPrice: 70, sellPrice: 100 });
    expect(row).not.toHaveProperty('priceHistory');
    expect(row).not.toHaveProperty('description');
    expect(row).not.toHaveProperty('workshopPending');
    await products.updateOne({ _id: output._id }, { $set: { stock: 5, sellPrice: 130 } });
    expect((await catalog.findForSale()).find((p) => String(p._id) === String(output._id)))
      .toMatchObject({ stock: 5, sellPrice: 130 });
  });

  it('calculates fixed plus percentage workshop wages once', async () => {
    const result = await service.create({ ...dto, laborPercent: 10 }, 'test');
    expect(result.laborFlatCost).toBe(40);
    expect(result.laborPercent).toBe(10);
    expect(result.laborCost).toBe(64); // 40 + 10% of (220 materials + 20 packaging)
    expect(result.totalCost).toBe(304);
    expect(result.output.unitCost).toBe(76);
  });

  const invoiceService = () => new InvoicesService(
    invoices as unknown as Model<InvoiceDocument>, products as unknown as Model<ProductDocument>,
    null, null, { ensureReconciled: async () => undefined, getPaidLater: async () => 0, removeInvoiceDebt: async () => undefined } as any, null, { sync: async () => undefined } as any,
    { get: async () => ({ factorySalesEnabled: true }) } as any, { rebuild: async () => [] } as any,
  );

  it('loads each product from its own newest purchase, including factory, unreceived and zero prices', async () => {
    const line = (p: ProductDocument, price: number, received = true) => ({ productId: String(p._id), productName: p.name, unit: p.unit, quantity: 1, unitPrice: price, totalPrice: price, received });
    await invoices.create({ invoiceNumber: 'PRICE-OLD', type: 'purchase', invoiceDate: new Date('2026-01-01'), items: [line(material, 100), line(output, 200)] });
    await invoices.create({ invoiceNumber: 'PRICE-FACTORY', type: 'purchase', fulfillment: 'factory', invoiceDate: new Date('2026-01-02'), items: [line(material, 120, false)] });
    await invoices.create({ invoiceNumber: 'PRICE-ZERO', type: 'purchase', invoiceDate: new Date('2026-01-03'), items: [line(output, 0)] });
    const prices = await invoiceService().lastShopPurchasePrices([String(material._id), String(output._id), String(packaging._id)]);
    expect(prices).toEqual({ [String(material._id)]: 120, [String(output._id)]: 0 });
  });

  it('keeps the chosen factory cost in both the sale and generated purchase without changing shop stock', async () => {
    const inv = await invoiceService().create({ type: 'sale', fulfillment: 'factory', customerName: 'حضوری',
      items: [{ productId: String(material._id), productName: material.name, unit: material.unit, quantity: 2, unitPrice: 150, totalPrice: 300, factoryUnitCost: 120 }],
      totalAmount: 300, finalAmount: 300, paymentMethod: 'cash',
    }, 'test');
    expect(inv.items[0].factoryUnitCost).toBe(120);
    expect(inv.items[0].factoryCostConfirmed).toBe(true);
    expect((await invoices.findById(inv.factoryPurchaseId))!.items[0].unitPrice).toBe(120);
    expect((await products.findById(material._id))!.stock).toBe(10);
    const edited = await invoiceService().update(String(inv._id), { type: 'sale', fulfillment: 'factory', customerName: 'حضوری',
      items: [{ productId: String(material._id), productName: material.name, unit: material.unit, quantity: 2, unitPrice: 160, totalPrice: 320, factoryUnitCost: 125 }],
      totalAmount: 320, finalAmount: 320, paymentMethod: 'cash',
    }, 'test');
    expect(edited.items[0].factoryUnitCost).toBe(125);
    expect((await invoices.findById(edited.factoryPurchaseId))!.items[0].unitPrice).toBe(125);
    expect((await products.findById(material._id))!.stock).toBe(10);
    const list = await invoiceService().findAll({ type: 'sale', fulfillment: 'factory' });
    expect(list.map((row) => String(row._id))).toEqual([String(inv._id)]);
  });

  it('stores factory overrides independently, respects zero, and resumes latest-purchase pricing on reset', async () => {
    const inv = invoiceService();
    const catalog = new ProductsService(products as unknown as Model<ProductDocument>, null, null);
    const id = String(material._id);
    const line = (price: number) => ({ productId: id, productName: material.name, unit: material.unit, quantity: 1, unitPrice: price, totalPrice: price });
    await invoices.create({ invoiceNumber: 'FACTORY-BASE', type: 'purchase', invoiceDate: new Date('2026-01-01'), items: [line(100)] });
    expect((await inv.factoryPrices([id]))[0]).toMatchObject({ price: 100, lastPurchasePrice: 100, overridePrice: null });
    expect((await inv.factoryPrices([String(output._id)]))[0].price).toBeNull();
    await catalog.setFactoryPrice(id, 130);
    await invoices.create({ invoiceNumber: 'FACTORY-NEW', type: 'purchase', invoiceDate: new Date('2026-01-02'), items: [line(110)] });
    expect((await inv.factoryPrices([id]))[0]).toMatchObject({ price: 130, lastPurchasePrice: 110, overridePrice: 130 });
    expect((await products.findById(id))!).toMatchObject({ buyPrice: 100, sellPrice: 120, stock: 10 });
    expect((await invoices.findOne({ invoiceNumber: 'FACTORY-BASE' }))!.items[0].unitPrice).toBe(100);
    await catalog.setFactoryPrice(id, 0);
    expect((await inv.factoryPrices([id]))[0].price).toBe(0);
    const sale = await inv.create({ type: 'sale', fulfillment: 'factory', customerName: 'حضوری',
      items: [{ ...line(150), factoryUnitCost: (await inv.factoryPrices([id]))[0].price }],
      totalAmount: 150, finalAmount: 150, paymentMethod: 'cash',
    }, 'test');
    expect(sale.items[0].factoryUnitCost).toBe(0);
    expect(sale.items[0].factoryCostConfirmed).toBe(true);
    expect((await invoices.findById(sale.factoryPurchaseId))!.items[0].unitPrice).toBe(0);
    await catalog.setFactoryPrice(id, null);
    // The generated purchase is now the latest invoice, including its explicit zero price.
    expect((await inv.factoryPrices([id]))[0]).toMatchObject({ price: 0, overridePrice: null });
    for (const invalid of [-1, NaN, Infinity, undefined, '20', 1e13]) {
      await expect(catalog.setFactoryPrice(id, invalid as any)).rejects.toThrow('نامعتبر');
    }
  });

  it('automatically prices packages from category kilograms and each product commission', async () => {
    const model = connection.models.AppSettings || connection.model(AppSettings.name, AppSettingsSchema);
    await model.deleteMany({});
    const settings = new SettingsService(model as any);
    const catalog = new ProductsService(products as unknown as Model<ProductDocument>, null, settings);
    await products.updateOne({ _id: output._id }, { $set: { category: 'تولیدی', autoPricing: true, commissionAmount: 2000, commissionUnit: 'kg', commissionPercent: 10 } });
    await catalog.saveCategoryPrice({ category: 'تولیدی', amount: 100000, unit: 'kg' }, 'test');
    expect((await products.findById(output._id))!.sellPrice).toBe(56100); // half kg: (50000 + 1000) * 1.10
    await catalog.saveCategoryPrice({ category: 'تولیدی', amount: 120000, unit: 'kg' }, 'test');
    expect((await products.findById(output._id))!.sellPrice).toBe(67100);
    const edited = await catalog.update(String(output._id), { commissionAmount: 2000, commissionUnit: 'unit', commissionPercent: 0 });
    expect(edited.sellPrice).toBe(62000);
  });

  it('deduplicates a synced sale after a lost response and across concurrent retries', async () => {
    const model = connection.models.OrderRequest || connection.model('OrderRequest', OrderRequestSchema);
    await model.deleteMany({});
    const receipts = new OrderRequestsService(model as any);
    const payload: CreateInvoiceDto = { type: 'sale', customerName: 'حضوری',
      items: [{ productId: String(material._id), productName: material.name, unit: material.unit, quantity: 2, unitPrice: 120, totalPrice: 240 }],
      totalAmount: 240, finalAmount: 240, paymentMethod: 'cash' };
    const key = randomUUID();
    const execute = jest.fn(() => invoiceService().create(payload, 'test'));
    const [first, second] = await Promise.all([receipts.run(key, 'user', 'invoice', payload, execute), receipts.run(key, 'user', 'invoice', payload, execute)]);
    expect(first._id).toBe(second._id);
    const restarted = new OrderRequestsService(model as any);
    expect((await restarted.run(key, 'user', 'invoice', payload, execute))._id).toBe(first._id);
    expect(execute).toHaveBeenCalledTimes(1);
    expect((await products.findById(material._id))!.stock).toBe(8);
    expect(await invoices.countDocuments({ type: 'sale' })).toBe(1);
    await expect(receipts.run(key, 'user', 'invoice', { ...payload, finalAmount: 1 }, execute)).rejects.toThrow('یکسان نیست');
  });

  it('retains an uncertain partial operation for review instead of executing it twice', async () => {
    const model = connection.models.OrderRequest || connection.model('OrderRequest', OrderRequestSchema);
    const receipts = new OrderRequestsService(model as any);
    const key = randomUUID();
    const execute = jest.fn(async () => { throw new Error('interrupted write'); });
    await expect(receipts.run(key, 'user', 'invoice', {}, execute)).rejects.toThrow('interrupted write');
    await expect(receipts.run(key, 'user', 'invoice', {}, execute)).rejects.toThrow('interrupted write');
    expect(execute).toHaveBeenCalledTimes(1);
  });

  it('preserves legacy opening inventory and workshop changes through stock rebuilds', async () => {
    await products.updateMany({}, { $unset: { openingStock: 1 } });
    // Material stock has a purchase invoice; other stock was entered manually.
    await invoices.create({
      invoiceNumber: 'TEST-OPENING',
      type: 'purchase',
      customerName: 'شرکت قند بلالی',
      items: [
        {
          productId: String(material._id),
          productName: material.name,
          quantity: 10,
          unit: material.unit,
          unitPrice: 100,
          totalPrice: 1000,
        },
      ],
      totalAmount: 1000,
      finalAmount: 1000,
    });
    await service.create(dto, 'test');
    const rebuild = () =>
      InvoicesService.prototype.rebuildStock.call({
        invoiceModel: invoices,
        productModel: products,
      });
    expect((await rebuild()).changed).toBe(0);
    await service.create({ ...dto, requestId: randomUUID() }, 'test');
    expect((await rebuild()).changed).toBe(0);
    expect((await products.findById(material._id))!.stock).toBe(6);
    expect((await products.findById(packaging._id))!.stock).toBe(12);
    expect((await products.findById(output._id))!.stock).toBe(10);
  });
});
