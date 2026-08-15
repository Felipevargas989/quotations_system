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
export class CreatePayrollDto {
  @IsString()
  label: string;

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
