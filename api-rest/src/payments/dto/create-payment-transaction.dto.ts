import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { Payment, PaymentTransaction } from '../entities/payment.entity';

export class CreatePaymentTransactionDto {
  @IsString()
  @IsNotEmpty()
  payment_id: Payment['id'];

  @IsString()
  @IsNotEmpty()
  quotation_id: Quotation['id'];

  @IsNumber()
  @IsNotEmpty()
  @Min(0, { message: 'Amount debe ser mayor a 0' })
  amount: number;

  @IsString()
  @IsNotEmpty()
  payment_method: PaymentTransaction['payment_method'];

  @IsDateString()
  @IsNotEmpty()
  transaction_date: string;

  @IsString()
  @IsOptional()
  notes?: PaymentTransaction['notes'];

  @IsString()
  @IsOptional()
  receipt_photo_url?: PaymentTransaction['receipt_photo_url'];
}
