import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import { ShareLink, ShareLinkSchema } from './schemas/share-link.schema';
import { SharesService } from './shares.service';
import { PublicSharesController, SharesController } from './shares.controller';
import { SuppliersModule } from '../suppliers/suppliers.module';

@Module({
  imports: [MongooseModule.forFeature([{ name: ShareLink.name, schema: ShareLinkSchema }]), SuppliersModule],
  controllers: [SharesController, PublicSharesController],
  providers: [SharesService],
})
export class SharesModule {}
