import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';
import { Refund } from '../entities/refund.entity';

export class CreateRefundDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(0)
  amount: Refund['amount'];

  @IsString()
  @IsNotEmpty()
  quotation_id: Refund['quotation_id'];
}
