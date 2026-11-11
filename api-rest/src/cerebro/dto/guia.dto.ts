import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { TOPES_DE_LA_GUIA } from '../guia';

export class SeccionDeGuiaDto {
  @IsString()
  @MaxLength(TOPES_DE_LA_GUIA.titulo)
  titulo: string;

  @IsString()
  @MaxLength(TOPES_DE_LA_GUIA.texto)
  texto: string;
}

export class GuardarGuiaDto {
  @IsArray()
  @ArrayMaxSize(TOPES_DE_LA_GUIA.secciones)
  @ValidateNested({ each: true })
  @Type(() => SeccionDeGuiaDto)
  secciones: SeccionDeGuiaDto[];
}
