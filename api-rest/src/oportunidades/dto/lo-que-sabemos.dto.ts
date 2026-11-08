import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import type { MarcaDeExigencia } from '../ficha/ficha.repository';

/** «Lo que Eventia sabe de tu empresa» (decisión 119, parte 3; migración
 *  190): cambiar lo que respondió o su detalle. Un detalle vacío lo borra. */
export class CambiarLoQueSabemosDto {
  @IsOptional()
  @IsIn(['lo_tengo', 'no_puedo'])
  respuesta?: MarcaDeExigencia;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  detalle?: string;
}
