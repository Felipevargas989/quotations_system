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
import type { TipoDeDte } from './borrador';

/**
 * EL DTE QUE SE PIDE: LA FACTURA O LA BOLETA DEL EVENTO (doc 19 §9.2 y
 * §9.20).
 *
 * Los largos de acá solo frenan lo absurdo: lo que no cabe en la factura
 * (el giro de 40, la comuna de 20…) lo dice la revisión con palabras, para
 * que la vista previa no se caiga mientras la persona escribe.
 */

/** Qué se emite y de dónde se arma el borrador: de una OC (solo la
 *  factura), o de la cotización. */
export class BaseDelDteDto {
  @IsIn([33, 39], { message: 'El DTE es una factura (33) o una boleta (39)' })
  tipo: TipoDeDte;

  @IsOptional()
  @IsInt()
  orden_de_compra_id?: number | null;
}

/** El RUT que se busca entre las razones sociales de la empresa. */
export class RutDto {
  @IsString()
  @MaxLength(20)
  rut: string;
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

/** Una línea: la descripción, la cantidad de personas y el precio
 *  unitario con IVA. Que la cantidad sea mayor que cero lo dice la
 *  revisión con palabras. */
export class LineaDelDteDto {
  @IsString()
  @MaxLength(200)
  descripcion: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  descripcion_larga?: string | null;

  @IsNumber({ maxDecimalPlaces: 6 })
  cantidad: number;

  @IsInt({ message: 'El precio va en pesos, sin decimales' })
  precio: number;
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

export class DtePedidoDto extends BaseDelDteDto {
  @ValidateNested()
  @Type(() => ReceptorDeLaFacturaDto)
  receptor: ReceptorDeLaFacturaDto;

  // La factura admite 60 líneas (archivo/factura.ts).
  @IsArray()
  @ArrayMaxSize(60)
  @ValidateNested({ each: true })
  @Type(() => LineaDelDteDto)
  lineas: LineaDelDteDto[];

  @IsArray()
  @ArrayMaxSize(40)
  @ValidateNested({ each: true })
  @Type(() => ReferenciaDeLaFacturaDto)
  referencias: ReferenciaDeLaFacturaDto[];

  @IsArray()
  @IsIn(CODIGOS_DE_REFERENCIA, { each: true })
  pedir_siempre: string[];
}
