import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';
import { Invoice, InvoiceSchema } from '../invoices/schemas/invoice.schema';
import { FollowUp, FollowUpSchema } from './schemas/follow-up.schema';
import { FollowUpsService } from './followups.service';
import { FollowUpsController } from './followups.controller';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: FollowUp.name, schema: FollowUpSchema },
      { name: Customer.name, schema: CustomerSchema },
      { name: Invoice.name, schema: InvoiceSchema },
    ]),
  ],
  controllers: [FollowUpsController],
  providers: [FollowUpsService],
})
export class FollowUpsModule {}
