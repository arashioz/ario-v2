import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { InvoicesModule } from '../invoices/invoices.module';
import { MellatService } from './mellat.service';
import { PaymentsService } from './payments.service';
import { PaymentsController } from './payments.controller';
import { MellatCallbackController } from './mellat-callback.controller';
import {
  MellatCounter,
  MellatCounterSchema,
  MellatPayment,
  MellatPaymentSchema,
} from './schemas/mellat-payment.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: MellatPayment.name, schema: MellatPaymentSchema },
      { name: MellatCounter.name, schema: MellatCounterSchema },
    ]),
    InvoicesModule,
  ],
  controllers: [PaymentsController, MellatCallbackController],
  providers: [MellatService, PaymentsService],
  exports: [PaymentsService, MellatService],
})
export class PaymentsModule {}
