import { FifoInvoice, FifoWorkshop, runFifo } from './fifo';

const invoice = (
  id: string,
  type: 'purchase' | 'sale',
  date: string,
  productId: string,
  quantity: number,
  unitPrice: number,
): FifoInvoice => ({
  _id: id,
  invoiceNumber: id,
  type,
  invoiceDate: new Date(date),
  customerName: type === 'purchase' ? 'شرکت قند بلالی' : 'مشتری',
  totalAmount: quantity * unitPrice,
  finalAmount: quantity * unitPrice,
  items: [
    {
      productId,
      productName: productId,
      quantity,
      unit: 'کیلوگرم',
      unitPrice,
      totalPrice: quantity * unitPrice,
    },
  ],
});

describe('workshop FIFO', () => {
  it('transfers consumed inventory cost into output without creating a sale or supplier purchase', () => {
    const batch: FifoWorkshop = {
      _id: 'batch',
      date: new Date('2026-10-03'),
      inputs: [{ productId: 'raw', quantity: 6, weightKg: 6, unitCost: 200 }],
      output: {
        productId: 'packed',
        productName: 'بسته',
        quantity: 12,
        weightKg: 6,
        unitCost: 110,
      },
      packagingCost: 40,
      laborCost: 80,
    };
    const result = runFifo(
      [
        invoice('buy1', 'purchase', '2026-10-01', 'raw', 4, 100),
        invoice('buy2', 'purchase', '2026-10-02', 'raw', 6, 200),
        invoice('sale', 'sale', '2026-10-04', 'packed', 6, 150),
      ],
      [
        { _id: 'raw', name: 'نبات', unit: 'کیلوگرم', weightPerUnitKg: 1 },
        { _id: 'packed', name: 'بسته', unit: 'بسته', weightPerUnitKg: 0.5 },
      ],
      [batch],
    );
    expect(result.lotsByProduct.get('raw')!.map((l) => l.kgLeft)).toEqual([
      0, 4,
    ]);
    // 4×100 + 2×200 + 120 costs = 920 for twelve packs; six sold = 460.
    expect(result.invoiceProfit.get('sale')!.cost).toBeCloseTo(460);
    expect(result.invoiceProfit.get('sale')!.profit).toBeCloseTo(440);
    expect(result.saleLines).toHaveLength(1);
    expect(result.invoices).toHaveLength(3);
    expect(result.lotsByProduct.get('packed')![0].kgLeft).toBe(3);
  });

  it('uses recorded cost for materials without purchase history and handles fractional units', () => {
    const result = runFifo(
      [],
      [],
      [
        {
          _id: 'batch',
          date: new Date(),
          inputs: [
            { productId: 'raw', quantity: 0.5, weightKg: 2, unitCost: 100 },
          ],
          output: {
            productId: 'out',
            productName: 'out',
            quantity: 5,
            weightKg: 0,
            unitCost: 12,
          },
          packagingCost: 5,
          laborCost: 5,
        },
      ],
    );
    expect(result.lots[0].costPerKg).toBe(12);
    expect(result.saleLines).toHaveLength(0);
  });
});
