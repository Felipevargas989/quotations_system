import { IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

// Mudanza #7 (28-07): registrar (completar) un reembolso.
export class RegisterRefundDto {
  @IsNumber()
  amount: number;

  @IsString()
  @IsNotEmpty()
  refund_date: string;

  @IsString()
  @IsNotEmpty()
  payment_method: string;

  @IsString()
  @IsOptional()
  receipt_url?: string | null;
}
