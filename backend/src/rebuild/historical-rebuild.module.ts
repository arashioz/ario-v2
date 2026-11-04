import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { AccountingModule } from '../accounting/accounting.module';
import { Invoice, InvoiceSchema } from '../invoices/schemas/invoice.schema';
import { PerformanceSnapshot, PerformanceSnapshotSchema } from '../accounting/schemas/performance-snapshot.schema';
import { PricingModule } from '../pricing/pricing.module';
import { PricePeriod, PricePeriodSchema } from '../pricing/schemas/price-period.schema';
import { HistoricalRebuildController } from './historical-rebuild.controller';
import { HistoricalRebuildService } from './historical-rebuild.service';
import { HistoricalRebuildBackup, HistoricalRebuildBackupSchema } from './schemas/historical-rebuild-backup.schema';
import { HistoricalRebuildRun, HistoricalRebuildRunSchema } from './schemas/historical-rebuild-run.schema';

@Module({
  imports: [
    AccountingModule,
    PricingModule,
    MongooseModule.forFeature([
      { name: HistoricalRebuildRun.name, schema: HistoricalRebuildRunSchema },
      { name: HistoricalRebuildBackup.name, schema: HistoricalRebuildBackupSchema },
      { name: Invoice.name, schema: InvoiceSchema },
      { name: PricePeriod.name, schema: PricePeriodSchema },
      { name: PerformanceSnapshot.name, schema: PerformanceSnapshotSchema },
    ]),
  ],
  controllers: [HistoricalRebuildController],
  providers: [HistoricalRebuildService],
})
export class HistoricalRebuildModule {}
