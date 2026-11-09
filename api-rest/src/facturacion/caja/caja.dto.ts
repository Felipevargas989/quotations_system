import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MEDIOS_DE_PAGO,
  type MedioDePago,
} from '../facturas/pago-de-la-factura';

/**
 * LO QUE LLEGA A LA CAJA DE RECEPCIÓN (doc 19 §9.43, sprint 2). La cuenta de
 * recepción es una para todos: quién abre y quién cierra se escriben.
 */

const PESOS = { message: 'Va en pesos, sin decimales' };
const NO_NEGATIVO = { message: 'No puede ser negativo' };

export class AbrirCajaDto {
  @IsString()
  @IsNotEmpty({ message: 'Falta quién abre la caja' })
  @MaxLength(60)
  quien: string;

  @IsInt(PESOS)
  @Min(0, NO_NEGATIVO)
  sencillo: number;
}

export class RetiroDeCajaDto {
  @IsInt(PESOS)
  @Min(1, { message: 'El retiro tiene que ser mayor que cero' })
  monto: number;

  @IsString()
  @IsNotEmpty({ message: 'Falta el motivo del retiro' })
  @MaxLength(120)
  motivo: string;
}

/** El cierre ciego: los cuatro montos que tiene quien cierra. */
export class CerrarCajaDto {
  @IsString()
  @IsNotEmpty({ message: 'Falta quién cierra la caja' })
  @MaxLength(60)
  quien: string;

  @IsInt(PESOS)
  @Min(0, NO_NEGATIVO)
  efectivo: number;

  @IsInt(PESOS)
  @Min(0, NO_NEGATIVO)
  debito: number;

  @IsInt(PESOS)
  @Min(0, NO_NEGATIVO)
  credito: number;

  @IsInt(PESOS)
  @Min(0, NO_NEGATIVO)
  transferencia: number;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  comentario?: string | null;
}

export class CorregirMedioDto {
  @IsIn([...MEDIOS_DE_PAGO], {
    message: 'El medio de pago es efectivo, débito, crédito o transferencia',
  })
  medio: MedioDePago;
}

export class RevisarCierreDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  nota?: string | null;
}
