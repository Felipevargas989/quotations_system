import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { ReceptorDeLaFacturaDto } from '../facturas/factura.dto';

/**
 * LA NOTA QUE SE PIDE (doc 19 §9.5, paso 4): anular (código 1), corregir un
 * texto (código 2, en $0) o rebajar un monto (código 3). La razón va en la
 * referencia del SII, que admite 90 caracteres.
 */
export class NotaPedidaDto {
  @IsIn(['anular', 'corregir', 'rebajar'])
  accion: 'anular' | 'corregir' | 'rebajar';

  @IsString()
  @IsNotEmpty({ message: 'Falta el motivo: va en la nota' })
  @MaxLength(90, {
    message: 'El motivo cabe en 90 caracteres (la razón del SII)',
  })
  motivo: string;

  // Rebajar: lo que se rebaja, con IVA.
  @IsOptional()
  @IsInt({ message: 'El monto va en pesos, sin decimales' })
  @Min(1, { message: 'El monto tiene que ser mayor que cero' })
  monto?: number | null;

  // Corregir un texto: el receptor como debió salir.
  @IsOptional()
  @ValidateNested()
  @Type(() => ReceptorDeLaFacturaDto)
  receptor?: ReceptorDeLaFacturaDto | null;
}

const FECHA = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** El período de la lista: un mes (AAAA-MM) o, desde el 06-11 (doc 19
 *  §9.22, sprint 2), un rango de fechas «desde» y «hasta» (AAAA-MM-DD, las
 *  dos incluidas), como los filtros de la maqueta. */
export class ListaDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'El mes va como AAAA-MM' })
  mes?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'La fecha «desde» va como AAAA-MM-DD' })
  desde?: string;

  @IsOptional()
  @Matches(FECHA, { message: 'La fecha «hasta» va como AAAA-MM-DD' })
  hasta?: string;

  /** Solo esos tipos, separados por coma (33,56,61): la nota elige de las
   *  facturas y las notas, sin bajar las boletas (§9.22, sprint 3). */
  @IsOptional()
  @Matches(/^\d{2}(,\d{2}){0,5}$/, {
    message: 'Los tipos van como 33,56,61',
  })
  tipos?: string;
}
