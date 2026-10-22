import {
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import type { MarcaDeExigencia } from '../ficha/ficha.repository';

/** «Exigencias de la licitación» (migración 152): lo que la empresa marca
 *  en una exigencia de las bases. `clave` es la exigencia en minúsculas y
 *  sin tildes; `marca` null la desmarca. */
export class MarcarExigenciaDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  clave!: string;

  @IsOptional()
  @IsIn(['lo_tengo', 'no_puedo'])
  marca?: MarcaDeExigencia | null;
}
