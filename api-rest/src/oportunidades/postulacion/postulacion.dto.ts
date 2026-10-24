import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Pedir la propuesta de experiencia (decisión 76). `excluir`: las claves
 *  que la empresa ya sacó («Buscar otras»). */
export class ProponerExperienciaDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(300)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  excluir?: string[];
}

/** Confirmar la experiencia (decisión 76): van las elegidas, sin las que
 *  se sacan. */
export class ConfirmarExperienciaDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(50)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  quitar?: string[];
}

/** Vincular una cotización que ya existe, sin reescribirla (decisión 73). */
export class VincularCotizacionDto {
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  numero!: number;
}

/** Llevar la propuesta técnica a la cotización (decisión 29): crea una
 *  nueva o reescribe la ya vinculada. Desde la decisión 74 no recibe un
 *  número: vincular una que existe es `VincularCotizacionDto`, que no
 *  reescribe. */
export class LlevarACotizacionDto {
  /** El precio de «Armar postulación», con IVA (decisión 35): la
   *  cotización queda con ese total. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000_000_000)
  total?: number;

  /** Las fechas elegidas al crear (decisión 69), AAAA-MM-DD: desde y,
   *  si dura más de un día, hasta. */
  @IsOptional()
  @Matches(ISO, { message: 'La fecha de inicio va como AAAA-MM-DD.' })
  desde?: string;

  @IsOptional()
  @Matches(ISO, { message: 'La fecha de término va como AAAA-MM-DD.' })
  hasta?: string;
}

/** «Armar postulación» (decisión 35): el precio total, con IVA, en pesos.
 *  Es lo único que pide. */
export class ArmarPostulacionDto {
  @IsInt()
  @Min(1)
  @Max(100_000_000_000)
  total!: number;
}

/** Un pedazo de un párrafo editado en Eventia (decisión 78): su texto, de
 *  qué corrida del Word salió y cómo se ve. */
export class TramoEditadoDto {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100_000)
  r?: number;

  @IsString()
  @MaxLength(20_000)
  t!: string;

  @IsOptional()
  @IsBoolean()
  b?: boolean;

  @IsOptional()
  @IsBoolean()
  i?: boolean;

  @IsOptional()
  @IsBoolean()
  u?: boolean;
}

export class ParrafoEditadoDto {
  @IsInt()
  @Min(0)
  @Max(1_000_000)
  id!: number;

  @IsArray()
  @ArrayMaxSize(2_000)
  @ValidateNested({ each: true })
  @Type(() => TramoEditadoDto)
  tramos!: TramoEditadoDto[];
}

/** Guardar un Word editado en Eventia (decisión 78): la huella con que se
 *  abrió y solo los párrafos que cambiaron. */
export class GuardarElWordDto {
  @Matches(/^[0-9a-f]{40}$/, { message: 'Falta la versión del Word.' })
  version!: string;

  @IsArray()
  @ArrayMaxSize(5_000)
  @ValidateNested({ each: true })
  @Type(() => ParrafoEditadoDto)
  parrafos!: ParrafoEditadoDto[];
}
