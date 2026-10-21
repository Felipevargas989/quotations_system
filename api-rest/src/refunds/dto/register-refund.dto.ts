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

  // Migración 158 (20-10-2026): notas, como las de los abonos.
  @IsString()
  @IsOptional()
  notes?: string | null;
}
