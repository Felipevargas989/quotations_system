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

/** El mes de la lista: AAAA-MM. */
export class MesDto {
  @IsOptional()
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'El mes va como AAAA-MM' })
  mes?: string;
}
