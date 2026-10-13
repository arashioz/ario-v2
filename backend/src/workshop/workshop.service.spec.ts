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
    });
    expect((await service.create(dto, 'آزمایش'))._id).toEqual(result._id);
    expect((await products.findById(material._id))!.stock).toBe(8);
    expect(await batches.countDocuments()).toBe(1);
    expect(
      await products.countDocuments({ workshopPending: String(result._id) }),
    ).toBe(0);
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
