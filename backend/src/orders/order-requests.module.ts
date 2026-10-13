import { Global, Module } from '@nestjs/common';
import { MongooseModule, Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { OrderRequestsService } from './order-requests.service';

@Schema({ timestamps: true })
export class OrderRequest {
  @Prop({ required: true, unique: true }) key: string;
  @Prop({ required: true }) fingerprint: string;
  @Prop({ default: 'processing' }) status: string;
  @Prop({ type: Object }) result?: unknown;
  @Prop({ default: '' }) error: string;
}
export const OrderRequestSchema = SchemaFactory.createForClass(OrderRequest);

@Global()
@Module({
  imports: [MongooseModule.forFeature([{ name: OrderRequest.name, schema: OrderRequestSchema }])],
  providers: [OrderRequestsService], exports: [OrderRequestsService],
})
export class OrderRequestsModule {}
