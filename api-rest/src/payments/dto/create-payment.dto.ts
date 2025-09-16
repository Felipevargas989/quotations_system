import { IsNotEmpty, IsNumber, IsString, Min } from 'class-validator';
import { Quotation } from 'src/quotations/entities/quotation.entity';

export class CreatePaymentDto {
  @IsString()
  @IsNotEmpty()
  quotation_id: Quotation['id'];

  @IsNumber()
  @IsNotEmpty()
  @Min(0, { message: 'Amount debe ser mayor a 0' })
  amount: number;

  @IsString()
  @IsNotEmpty()
  notes: string;
}
