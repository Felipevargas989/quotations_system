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

  @IsIn(['clientes', 'importada'])
  audiencia_tipo: 'clientes' | 'importada';

  @IsOptional()
  @IsString()
  @MaxLength(80)
  audiencia_ref?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  tipos_cliente?: string[];
}

export class EnviarCampanaDto {
  @IsInt()
  id: number;
}
