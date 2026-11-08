import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, Min } from 'class-validator';

/** «Traer factura por N°» (doc 19 §9.36): sin `guardar`, solo la lee. */
export class TraerFacturaDto {
  @Type(() => Number)
  @IsInt({ message: 'El N° de la factura es un número entero' })
  @Min(1, { message: 'El N° de la factura es un número entero' })
  folio: number;

  @IsOptional()
  @IsBoolean()
  guardar?: boolean;
}
