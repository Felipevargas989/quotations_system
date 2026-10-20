import { PartialType } from '@nestjs/mapped-types';
import { IsInt, IsOptional, Min } from 'class-validator';
import { CreateQuotationDto } from './create-quotation.dto';

export class UpdateQuotationDto extends PartialType(CreateQuotationDto) {
  /**
   * Al ANULAR un evento con abonos, cuánto se devuelve (20-10-2026,
   * utils/reembolso-al-anular.ts). Viene solo si en la pregunta dijeron
   * que sí: nace un reembolso PENDIENTE por ese monto. No es columna de la
   * cotización: el servicio lo saca antes de guardar.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  reembolso_al_anular?: number;
}
