import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

// Tipos de archivo que el sistema conoce. Cada uno define su balde y la
// forma de su ruta; el navegador NUNCA elige la ruta final.
export const KINDS = [
  'payment-receipt',
  'refund-receipt',
  'event-document',
  'furniture-photo',
  'company-logo',
] as const;
export type UploadKind = (typeof KINDS)[number];

export class UploadFileDto {
  @IsIn(KINDS as unknown as string[])
  kind: UploadKind;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  quotation_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  payment_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  transaction_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  refund_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  category?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  item_id?: string;
}

export class SignedUrlDto {
  // Ruta nueva (c<empresa>/...) o URL pública vieja guardada en la base.
  @IsString()
  @MaxLength(1000)
  src: string;
}
