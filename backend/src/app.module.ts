import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { UsersModule } from './users/users.module';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { ProductsModule } from './products/products.module';
import { InvoicesModule } from './invoices/invoices.module';
import { ChequesModule } from './cheques/cheques.module';
import { ExpensesModule } from './expenses/expenses.module';
import { HistoryModule } from './history/history.module';
import { FollowUpsModule } from './followups/followups.module';
import { AccountingModule } from './accounting/accounting.module';
import { NotesModule } from './notes/notes.module';
import { SuppliersModule } from './suppliers/suppliers.module';
import { SettingsModule } from './settings/settings.module';
import { ProformasModule } from './proformas/proformas.module';
import { SharesModule } from './shares/shares.module';
import { AuditModule } from './audit/audit.module';
import { BackupModule } from './backup/backup.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '.env',
    }),
    MongooseModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: async (configService: ConfigService) => ({
        uri:
          configService.get<string>('MONGODB_URI') ||
          'mongodb://localhost:27019/ario_db',
      }),
    }),
    AuditModule,
    UsersModule,
    AuthModule,
    CustomersModule,
    ProductsModule,
    InvoicesModule,
    ChequesModule,
    ExpensesModule,
    HistoryModule,
    FollowUpsModule,
    AccountingModule,
    NotesModule,
    SuppliersModule,
    SettingsModule,
    ProformasModule,
    SharesModule,
    BackupModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
