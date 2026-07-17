import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { Quotation } from 'src/quotations/entities/quotation.entity';
import { PaymentTransaction } from '../entities/payment.entity';

// Registro de pago con "derrame": el monto se reparte en cascada entre las
// cuotas pendientes/vencidas (de la más próxima hacia adelante), creando una
// transacción por cada cuota tocada y marcando como pagadas las que se llenan.
export class CreateOverflowTransactionDto {
  @IsString()
  @IsNotEmpty()
  quotation_id: Quotation['id'];

  @IsNumber()
  @IsNotEmpty()
  @Min(1, { message: 'Amount debe ser mayor a 0' })
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
