import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { CODIGOS_DE_REFERENCIA } from '../referencias';
import type { TipoDeDte } from './borrador';
import { MEDIOS_DE_PAGO, PLAZOS_DE_PAGO } from './pago-de-la-factura';

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

/** El borrador de BelIA (§9.26): de dónde se arma y qué parte se factura,
 *  el % de la OC (o de la cotización). Sin el %, todo lo que queda. */
export class BorradorDelDteDto extends BaseDelDteDto {
  @IsOptional()
  @IsNumber(
    { maxDecimalPlaces: 2 },
    { message: 'El porcentaje va con dos decimales como máximo' },
  )
  @Min(1, { message: 'El porcentaje va de 1 a 100' })
  @Max(100, { message: 'El porcentaje va de 1 a 100' })
  porcentaje?: number | null;
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

  // §9.22: el descuento de la línea en %, con dos decimales.
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(99.99, { message: 'El descuento va de 0 a menos de 100 %' })
  descuento?: number | null;

  // §9.23: la línea elegida del tarifario (la factura de «Nuevo
  // documento»); el nombre y el precio los pone el motor.
  @IsOptional()
  @IsInt()
  tarifario_id?: number | null;
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

  // El motivo (RazonRef): lo que no cabe en los 90 lo dice la revisión.
  @IsOptional()
  @IsString()
  @MaxLength(200)
  razon?: string | null;
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

  // §9.22: contado (1) o crédito (2) a 30, 45 o 60 días. Sin esto, crédito
  // a 30.
  @IsOptional()
  @IsIn([1, 2], { message: 'La condición de pago es contado o crédito' })
  forma_de_pago?: 1 | 2 | null;

  @IsOptional()
  @IsIn([...PLAZOS_DE_PAGO], {
    message: 'El crédito va a 30, 45 o 60 días',
  })
  plazo_dias?: number | null;

  // §9.43: al contado, con qué se pagó (para cuadrar la caja). Si falta, la
  // revisión lo pide en «lo que falta»; a crédito se ignora.
  @IsOptional()
  @IsIn([...MEDIOS_DE_PAGO], {
    message: 'El medio de pago es efectivo, débito, crédito o transferencia',
  })
  medio_de_pago?: (typeof MEDIOS_DE_PAGO)[number] | null;

  // «Nuevo documento»: el cliente de Eventia al que va la factura.
  @IsOptional()
  @IsUUID()
  cliente_id?: string | null;

  // §9.32: la fecha de emisión elegida; el rango lo revisa el motor
  // (`fecha-de-emision.ts`). Sin ella, la de hoy.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de emisión va como AAAA-MM-DD',
  })
  fecha_emision?: string | null;
}
