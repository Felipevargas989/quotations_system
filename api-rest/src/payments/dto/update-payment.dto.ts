import { IsNotEmpty, IsNumber, Min } from 'class-validator';
import { Payment } from '../entities/payment.entity';

export class UpdatePaymentDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(0, { message: 'Cantidad debe ser mayor a 0' })
  amount: Payment['amount'];
}
