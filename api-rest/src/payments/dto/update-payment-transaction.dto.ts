import { IsNotEmpty, IsString } from 'class-validator';

import { PartialType } from '@nestjs/mapped-types';
import { CreatePaymentTransactionDto } from './create-payment-transaction.dto';

export class UpdatePaymentTransactionDto extends PartialType(
  CreatePaymentTransactionDto,
) {
  @IsString()
  @IsNotEmpty()
  id: string;

  @IsString()
  @IsNotEmpty()
  payment_id: string;

  @IsString()
  @IsNotEmpty()
  quotation_id: string;
}
