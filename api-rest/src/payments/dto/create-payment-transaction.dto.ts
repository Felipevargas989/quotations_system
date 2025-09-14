import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { PaymentTransaction } from '../entities/payment.entity';

export class CreatePaymentTransactionDto {
  @IsString()
  @IsNotEmpty()
  payment_id: PaymentTransaction['id'];

  @IsString()
  @IsNotEmpty()
  quotation_id: Quotation['id'];

  @IsNumber()
  @IsNotEmpty()
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
