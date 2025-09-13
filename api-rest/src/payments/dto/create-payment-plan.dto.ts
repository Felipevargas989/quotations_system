import { IsArray, IsNotEmpty, IsString } from 'class-validator';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { Payment } from '../entities/payment.entity';

export class CreatePaymentPlanDto {
  @IsString()
  @IsNotEmpty()
  quotation_id: Quotation['id'];

  @IsArray()
  @IsNotEmpty()
  payments: Payment[];
}
