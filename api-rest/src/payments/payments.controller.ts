import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import type { User } from 'src/users/entities/user.entity';
import { CreatePaymentPlanDto } from './dto/create-payment-plan.dto';
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

  // @Get(':id')
  // findOne(@Param('id') id: string) {
  //   return this.paymentsService.findOne(+id);
  // }

  // @Patch(':id')
  // update(@Param('id') id: string, @Body() updatePaymentDto: UpdatePaymentDto) {
  //   return this.paymentsService.update(+id, updatePaymentDto);
  // }

  // @Delete(':id')
  // remove(@Param('id') id: string) {
  //   return this.paymentsService.remove(+id);
  // }
}
