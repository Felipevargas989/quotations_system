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

  @IsOptional()
  @IsString()
  @MaxLength(80)
  boton_texto?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  boton_url?: string;

  @IsIn(['clientes', 'importada', 'segmento'])
  audiencia_tipo: 'clientes' | 'importada' | 'segmento';

  @IsOptional()
  @IsString()
  @MaxLength(80)
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

export class FiltroSegmentoDto {
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tipos_cliente?: string[];

  @IsOptional()
  @IsArray()
  @IsIn(['realizada', 'aceptada', 'rechazada'], { each: true })
  con_estados?: ('realizada' | 'aceptada' | 'rechazada')[];

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

export class ReenviarDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  asunto?: string;
}
