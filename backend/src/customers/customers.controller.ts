import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { RecordTransactionDto } from './dto/record-transaction.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Get('stats')
  async getStats() {
    return this.customersService.getStats();
  }

  @Get('payments')
  async listPayments(
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('search') search?: string,
  ) {
    return this.customersService.listPayments({ from, to, search });
  }

  @Delete('transactions/:txId')
  async deleteTransaction(@Param('txId') txId: string) {
    return this.customersService.deleteTransaction(txId);
  }

  @Post()
  async create(@Body() createCustomerDto: CreateCustomerDto, @Request() req: any) {
    const recordedByName = req.user?.fullName || req.user?.username || 'کاربر سیستم';
    return this.customersService.create(createCustomerDto, recordedByName);
  }

  @Get()
  async findAll(
    @Query('search') search?: string,
    @Query('filter') filter?: 'all' | 'debtors' | 'settled' | 'creditors',
    @Query('kind') kind?: 'shop' | 'walkin',
  ) {
    return this.customersService.findAll({ search, filter, kind });
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.customersService.findOne(id);
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
  ) {
    return this.customersService.update(id, updateCustomerDto);
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return this.customersService.remove(id);
  }

  @Post(':id/transactions')
  async recordTransaction(
    @Param('id') id: string,
    @Body() recordTransactionDto: RecordTransactionDto,
    @Request() req: any,
  ) {
    const recordedByName = req.user?.fullName || req.user?.username || 'کاربر سیستم';
    return this.customersService.recordTransaction(
      id,
      recordTransactionDto,
      recordedByName,
    );
  }

  @Get(':id/transactions')
  async getTransactions(@Param('id') id: string) {
    return this.customersService.getTransactions(id);
  }

  @Post(':id/send-sms')
  async sendDebtReminderSms(@Param('id') id: string) {
    return this.customersService.sendDebtReminderSms(id);
  }
}
