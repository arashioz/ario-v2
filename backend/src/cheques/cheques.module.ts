import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { Cheque, ChequeSchema } from './schemas/cheque.schema';
import { ChequesService } from './cheques.service';
import { ChequesController } from './cheques.controller';
import { Customer, CustomerSchema } from '../customers/schemas/customer.schema';

@Module({
  imports: [
    MongooseModule.forFeature([
      { name: Cheque.name, schema: ChequeSchema },
      { name: Customer.name, schema: CustomerSchema },
    ]),
  ],
  controllers: [ChequesController],
  providers: [ChequesService],
  exports: [ChequesService],
})
export class ChequesModule {}
