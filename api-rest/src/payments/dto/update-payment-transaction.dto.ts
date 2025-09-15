import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreatePaymentTransactionDto } from './create-payment-transaction.dto';

export class UpdatePaymentTransactionDto extends PartialType(
  OmitType(CreatePaymentTransactionDto, ['payment_id', 'quotation_id']),
) {}
