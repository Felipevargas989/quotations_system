import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

// Lo que manda la ventanilla de Evia (doc 20 §8). La conversación vive en
// el navegador: cada mensaje trae la historia corta y la pantalla.

export class TurnoDto {
  @IsIn(['persona', 'evia'])
  rol: 'persona' | 'evia';

  @IsString()
  @MaxLength(8000)
  texto: string;
}

export class PantallaDto {
  /** La ruta de la app (/post-venta/…, /quotations…). */
  @IsOptional()
  @IsString()
  @MaxLength(300)
  ruta?: string;

  /** La cotización abierta, si hay una. Se revisa que sea de la empresa. */
  @IsOptional()
  @IsUUID()
  cotizacion_id?: string;
}

export class MensajeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  mensaje: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => TurnoDto)
  historial?: TurnoDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => PantallaDto)
  pantalla?: PantallaDto;
}
