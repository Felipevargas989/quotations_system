import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
} from 'class-validator';
import {
  MEDIOS_DE_PAGO,
  type MedioDePago,
} from '../facturas/pago-de-la-factura';

/**
 * LO QUE LLEGA A LA CAJA DE RECEPCIÓN (doc 19 §9.43, sprint 2). Quién abre y
 * quién cierra no se escriben: salen del perfil de la sesión (Felipe, 09-11:
 * *"el quién abre debe ser asociado al perfil que está abriendo la caja,
 * que no sea escrito a mano"*).
 */

const PESOS = { message: 'Va en pesos, sin decimales' };
const NO_NEGATIVO = { message: 'No puede ser negativo' };

export class AbrirCajaDto {
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

/** «Lo vendido» (sprint 3): el período y, si se elige, la persona. */
export class LoVendidoQueryDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Desde va como AAAA-MM-DD' })
  desde: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Hasta va como AAAA-MM-DD' })
  hasta: string;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  persona?: string;
}
