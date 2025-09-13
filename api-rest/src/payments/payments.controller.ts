import { Controller, Get, Query } from '@nestjs/common';
import { CurrentUser } from 'src/auth';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import type { User } from 'src/users/entities/user.entity';
import { PaymentsService } from './payments.service';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  // @Post()
  // create(@Body() createPaymentDto: CreatePaymentDto) {
  //   return this.paymentsService.create(createPaymentDto);
  // }

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
