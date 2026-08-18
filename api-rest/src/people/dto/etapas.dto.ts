import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const DIA = /^\d{4}-\d{2}-\d{2}$/;

// ---- El ciclo de la ficha ----
// "cerrada" NO entra por acá: solo por /sheets/cerrar, que valida el
// candado de la plata.
export class UpsertSheetDto {
  @IsUUID()
  quotation_id: string;

  @IsIn(['armando', 'confirmado', 'trabajado'])
  status: string;
}

export class CerrarFichaDto {
  @IsUUID()
  quotation_id: string;
}

/** Reabrir una liquidación: un evento (quotation_id) o un día de
 *  restaurante (day). Uno de los dos. */
export class ReabrirLiquidacionDto {
  @IsOptional()
  @IsUUID()
  quotation_id?: string;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  day?: string;
}

// ---- Los pozos de propina ----
export class CreatePoolDto {
  @IsOptional()
  @IsUUID()
  quotation_id?: string | null;

  @IsOptional()
  @Matches(DIA, { message: 'El día va como 2026-08-14' })
  day?: string | null;

  @IsOptional()
  @IsString()
  area?: string | null;

  @IsOptional()
  @IsNumber()
  first_amount?: number;

  @IsOptional()
  @IsNumber()
  second_amount?: number;
}

export class UpdatePoolDto {
  @IsOptional()
  @IsNumber()
  first_amount?: number;

  @IsOptional()
  @IsNumber()
  second_amount?: number;

  @IsOptional()
  @IsString()
  area?: string | null;
}

export class PorcentajeDto {
  // NULL = las filas sin cargo asignado.
  @IsOptional()
  @IsInt()
  role_id?: number | null;

  @IsNumber()
  pct: number;
}

export class RepartirDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PorcentajeDto)
  porcentajes: PorcentajeDto[];
}

// ---- Las estrellas ----
export class CreateReviewDto {
  @IsInt()
  person_id: number;

  @IsOptional()
  @IsUUID()
  quotation_id?: string | null;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(5)
  stars?: number | null;

  @IsOptional()
  @IsString()
  note?: string | null;
}

// ---- La nómina ----
// No es una semana: es un SELECTOR de qué se liquida. Todo lo
// pendiente hasta una fecha, un rango, o eventos sueltos.
/**
 * QUÉ se liquida, sin decidir todavía si se genera. La vista previa usa
 * solo esto: no crea nada, así que no tiene por qué pedir un nombre de
 * nómina — pedirlo hacía fallar la revisión con "label must be a
 * string" (Felipe, 16-08).
 */
export class SeleccionPayrollDto {
  @IsOptional()
  @Matches(DIA)
  hasta?: string;

  @IsOptional()
  @Matches(DIA)
  desde?: string;

  @IsOptional()
  @IsArray()
  @IsUUID(undefined, { each: true })
  quotation_ids?: string[];

  /**
   * DÍAS SUELTOS DE RESTAURANTE (Felipe, 16-08): "el botón de liquidar
   * días que liquide esos días que están repartidos y no todo".
   *
   * Cuando viene, manda por sobre las fechas: la nómina se arma con
   * esos días Y SOLO con lo que no es de un evento. Sin esto, un rango
   * que cubriera la semana se llevaba también los eventos de esa
   * semana, que se liquidan por su cuenta.
   */
  @IsOptional()
  @IsArray()
  @Matches(DIA, { each: true })
  dias?: string[];
}

/** La misma selección, más el nombre con que nace la nómina. */
/** La misma revisión, pero para UN evento todavía abierto: qué quedaría
 *  por pagar si se liquida ahora (Felipe, 18-08). */
export class PreviaPreliminarDto {
  @IsUUID()
  quotation_id: string;
}

export class CreatePayrollDto extends SeleccionPayrollDto {
  @IsString()
  label: string;
}

export class PagoDto {
  @IsInt()
  person_id: number;

  @IsOptional()
  @IsBoolean()
  jornada_paid?: boolean;

  @IsOptional()
  @IsBoolean()
  propina_paid?: boolean;
}

// ---- Las notas del día ----
// Recados operativos: "llegan a las 11, el bus se estaciona atrás".
export class CreateDayNoteDto {
  @Matches(DIA, { message: 'El día va como 2026-08-14' })
  day: string;

  @IsOptional()
  @IsUUID()
  quotation_id?: string | null;

  @IsString()
  text: string;
}

export class UpdateDayNoteDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsBoolean()
  done?: boolean;
}
