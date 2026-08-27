import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class ContactoImportadoDto {
  @IsString()
  @MaxLength(320)
  email: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  empresa?: string;
}

export class ImportarContactosDto {
  @IsString()
  @MaxLength(80)
  audiencia: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ContactoImportadoDto)
  contactos: ContactoImportadoDto[];
}

export class FiltroSegmentoDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tipos_cliente?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(['realizada', 'aceptada', 'rechazada', 'cancelada', 'anulada'], {
    each: true,
  })
  con_estados?: (
    | 'realizada'
    | 'aceptada'
    | 'rechazada'
    | 'cancelada'
    | 'anulada'
  )[];

  @IsOptional()
  @IsString()
  evento_desde?: string;

  @IsOptional()
  @IsString()
  evento_hasta?: string;

  @IsOptional()
  @IsString()
  sin_cotizacion_desde?: string;

  @IsOptional()
  aniversario?: boolean;

  @IsOptional()
  monto_min?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tipos_evento?: string[];
}

export class PreviaSegmentoDto {
  @ValidateNested()
  @Type(() => FiltroSegmentoDto)
  filtro: FiltroSegmentoDto;
}

/** La audiencia guardada: un nombre y su pregunta (consulta viva). */
export class CrearAudienciaDto {
  @IsString()
  @MaxLength(120)
  nombre: string;

  @ValidateNested()
  @Type(() => FiltroSegmentoDto)
  filtro: FiltroSegmentoDto;
}

/** Editar un BORRADOR desde su ficha (Felipe 26-08): solo contenido.
 *  Una campaña enviada es registro histórico y no se toca. */
export class EditarCampanaDto {
  @IsString()
  @MaxLength(200)
  asunto: string;

  @IsString()
  @MaxLength(200)
  titulo: string;

  @IsString()
  @MaxLength(8000)
  cuerpo: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  preencabezado?: string;
}

export class CrearCampanaDto {
  @IsString()
  @MaxLength(120)
  nombre: string;

  @IsString()
  @MaxLength(200)
  asunto: string;

  @IsString()
  @MaxLength(200)
  titulo: string;

  @IsString()
  @MaxLength(8000)
  cuerpo: string;

  /** El segundo asunto: la frase gris de la bandeja (optativa). */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  preencabezado?: string;

  @IsIn(['clientes', 'importada', 'segmento'])
  audiencia_tipo: 'clientes' | 'importada' | 'segmento';

  /** Audiencia guardada elegida (tipo segmento). */
  @IsOptional()
  @IsInt()
  audiencia_id?: number;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  audiencia_ref?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tipos_cliente?: string[];

  @IsOptional()
  @ValidateNested()
  @Type(() => FiltroSegmentoDto)
  filtro?: FiltroSegmentoDto;
}

export class EnviarCampanaDto {
  @IsInt()
  id: number;
}

export class ReenviarDto {
  /** La segunda pasada EXIGE asunto nuevo (regla del manual). */
  @IsString()
  @MaxLength(200)
  asunto: string;
}
