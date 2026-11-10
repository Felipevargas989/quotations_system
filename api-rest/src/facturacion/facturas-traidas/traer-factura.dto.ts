import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Min } from 'class-validator';

/** «Traer factura por N°» (doc 19 §9.36): sin `guardar`, solo la lee. El
 *  tipo: la factura (33, si no se dice) o la nota de crédito (61). */
export class TraerFacturaDto {
  @Type(() => Number)
  @IsInt({ message: 'El N° de la factura es un número entero' })
  @Min(1, { message: 'El N° de la factura es un número entero' })
  folio: number;

  @IsOptional()
  @IsBoolean()
  guardar?: boolean;

  @IsOptional()
  @Type(() => Number)
  @IsIn([33, 61], {
    message: 'Se trae una factura (33) o una nota de crédito (61)',
  })
  tipo?: 33 | 61;
}
