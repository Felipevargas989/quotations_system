import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { CODIGOS_DE_REFERENCIA } from '../referencias';

/**
 * LA FACTURA QUE SE PIDE (doc 19 §9.2, paso 2c).
 *
 * Los largos de acá solo frenan lo absurdo: lo que no cabe en la factura
 * (el giro de 40, la comuna de 20…) lo dice la revisión con palabras, para
 * que la vista previa no se caiga mientras la persona escribe.
 */

/** De qué se arma el borrador: de una OC, o del evento si no hay OC. */
export class BaseDeLaFacturaDto {
  @IsOptional()
  @IsInt()
  orden_de_compra_id?: number | null;
}

export class ReceptorDeLaFacturaDto {
  @IsString()
  @MaxLength(20)
  rut: string;

  @IsString()
  @MaxLength(200)
  razon_social: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  giro?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  direccion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  comuna?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  ciudad?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(400)
  correo?: string | null;
}

export class DetalleDeLaFacturaDto {
  @IsString()
  @MaxLength(200)
  descripcion: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion_larga?: string | null;
}

export class ReferenciaDeLaFacturaDto {
  @IsIn(CODIGOS_DE_REFERENCIA)
  tipo: string;

  @IsString()
  @MaxLength(40)
  folio: string;

  @IsString()
  @MaxLength(10)
  fecha: string;
}

export class FacturaPedidaDto extends BaseDeLaFacturaDto {
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  porcentaje?: number | null;

  @IsOptional()
  @IsInt({ message: 'El monto va en pesos, sin decimales' })
  monto?: number | null;

  @ValidateNested()
  @Type(() => ReceptorDeLaFacturaDto)
  receptor: ReceptorDeLaFacturaDto;

  @ValidateNested()
  @Type(() => DetalleDeLaFacturaDto)
  detalle: DetalleDeLaFacturaDto;

  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ReferenciaDeLaFacturaDto)
  referencias: ReferenciaDeLaFacturaDto[];

  @IsArray()
  @IsIn(CODIGOS_DE_REFERENCIA, { each: true })
  pedir_siempre: string[];
}
