import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import type { User } from 'src/users/entities/user.entity';
import { CreatePaymentPlanDto } from './dto/create-payment-plan.dto';
import { CreatePaymentTransactionDto } from './dto/create-payment-transaction.dto';
import { UpdatePaymentTransactionDto } from './dto/update-payment-transaction.dto';
import { Payment, PaymentTransaction } from './entities/payment.entity';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly logger: PinoLogger,
  ) {}

  @Post('plan')
  createPaymentPlan(
    @Body() createPaymentPlanDto: CreatePaymentPlanDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /payments/plan with user ${user.id}`);
    return this.paymentsService.createPaymentPlan(
      createPaymentPlanDto,
      user.company_id,
    );
  }

  @Get()
  findAllPaymensFromQuotation(
    @Query('quotationId') quotationId: Quotation['id'],
    @CurrentUser() user: User,
  ) {
    return this.paymentsService.findAllPaymentsFromQuotation(
      quotationId,
      user.company_id,
    );
  }

  @Get('transactions')
  findAllPaymentsWithTransactions(@CurrentUser() user: User) {
    this.logger.info(`GET /payments/transactions with user ${user.id}`);
    return this.paymentsService.findAllPaymentsWithTransactions(
      user.company_id,
    );
  }

  @Post('transactions')
  createPaymentTransaction(
    @Body() createPaymentTransactionDto: CreatePaymentTransactionDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /payments/transactions with user ${user.id}`);
    return this.paymentsService.createPaymentTransaction(
      createPaymentTransactionDto,
      user.company_id,
    );
  }

  @Patch('transactions/:id')
  updatePaymentTransaction(
    @Param('id') paymentTransactionId: PaymentTransaction['id'],
    @Body() updatePaymentTransactionDto: UpdatePaymentTransactionDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PATCH /payments/transactions/${paymentTransactionId} with updatePaymentTransactionDto ${JSON.stringify(updatePaymentTransactionDto)}`,
    );
    return this.paymentsService.updatePaymentTransaction(
      paymentTransactionId,
      updatePaymentTransactionDto,
      user.company_id,
    );
  }
  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.paymentsService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updatePaymentDto: UpdatePaymentDto) {
  //   return this.paymentsService.update(+id, updatePaymentDto);
  // }

  @Delete(':id')
  removePayment(@Param('id') id: Payment['id']) {
    this.logger.info(`DELETE /payments/${id}`);
    return this.paymentsService.removePayment(id);
  }

  @Delete('transactions/:id')
  removePaymentTransaction(@Param('id') id: number) {
    this.logger.info(`DELETE /payments/transactions/${id}`);
    return this.paymentsService.removePaymentTransaction(+id);
  }
}
