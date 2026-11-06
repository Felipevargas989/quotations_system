import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

/**
 * LOS COBROS POR BOLETEAR Y SU REPARTO (migración 187, doc 19 §9.4).
 *
 * Los largos son los de la base: la cabaña hasta 22 y el cobro hasta 55,
 * para que la glosa de la boleta (la cabaña y el cobro) quepa entera en sus
 * 80 caracteres. Los montos van con IVA, en pesos enteros.
 */

export class CrearCobroDto {
  // El evento, si se deja desde su pestaña Facturación.
  @IsOptional()
  @IsUUID()
  quotation_id?: string | null;

  @IsString()
  @IsNotEmpty({ message: 'Falta qué se cobra' })
  @MaxLength(55, {
    message:
      'Qué se cobra cabe en 55 caracteres (va en la boleta con la cabaña)',
  })
  descripcion: string;

  @IsInt({ message: 'El total va en pesos, sin decimales' })
  @Min(1, { message: 'El total tiene que ser mayor que cero' })
  total: number;
}

export class EditarCobroDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'Falta qué se cobra' })
  @MaxLength(55, {
    message:
      'Qué se cobra cabe en 55 caracteres (va en la boleta con la cabaña)',
  })
  descripcion?: string;

  @IsOptional()
  @IsInt({ message: 'El total va en pesos, sin decimales' })
  @Min(1, { message: 'El total tiene que ser mayor que cero' })
  total?: number;
}

export class LineaDelCobroDto {
  @IsString()
  @IsNotEmpty({ message: 'Falta la cabaña' })
  @MaxLength(22, { message: 'La cabaña cabe en 22 caracteres' })
  cabana: string;

  @IsInt({ message: 'El monto va en pesos, sin decimales' })
  @Min(1, { message: 'El monto tiene que ser mayor que cero' })
  monto: number;

  // El del huésped, si lo da: facturacion.cl le manda la boleta.
  @IsOptional()
  @ValidateIf((o: { correo?: string | null }) => !!o.correo)
  @IsEmail({}, { message: 'Ese correo no es válido' })
  @MaxLength(200)
  correo?: string | null;
}

export class EditarLineaDelCobroDto extends PartialType(LineaDelCobroDto) {}

/**
 * ⚠ GEMELO: las unidades viven también en
 *   `frontend/src/constants/boletas.ts`. Si se cambian acá, se cambian allá.
 */
export const UNIDADES_DEL_TARIFARIO = [
  'noche',
  'persona',
  'día',
  'hora',
  'unidad',
] as const;

/** Un ítem del tarifario de las boletas (D3): lo escribe el administrador. */
export class ItemDelTarifarioDto {
  @IsString()
  @IsNotEmpty({ message: 'Falta el nombre' })
  @MaxLength(60, { message: 'El nombre cabe en 60 caracteres' })
  nombre: string;

  @IsInt({ message: 'El precio va en pesos, sin decimales' })
  @Min(1, { message: 'El precio tiene que ser mayor que cero' })
  precio: number;

  @IsIn(UNIDADES_DEL_TARIFARIO, { message: 'Esa unidad no existe' })
  unidad: string;
}

export class EditarItemDelTarifarioDto extends PartialType(
  ItemDelTarifarioDto,
) {
  @IsOptional()
  @IsBoolean()
  activo?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  orden?: number;
}

/** Una línea de la boleta suelta: del tarifario por una cantidad, o (solo
 *  el administrador) a mano, con qué se cobra y su monto. */
export class LineaSueltaDto {
  @IsOptional()
  @IsInt()
  tarifario_id?: number | null;

  @IsOptional()
  @IsInt({ message: 'La cantidad va sin decimales' })
  @Min(1, { message: 'La cantidad tiene que ser al menos 1' })
  @Max(999)
  cantidad?: number;

  @IsOptional()
  @IsString()
  @MaxLength(80, { message: 'Qué se cobra cabe en 80 caracteres' })
  descripcion?: string | null;

  @IsOptional()
  @IsInt({ message: 'El monto va en pesos, sin decimales' })
  @Min(1, { message: 'El monto tiene que ser mayor que cero' })
  monto?: number | null;
}

export class BoletaSueltaDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'La boleta necesita al menos una línea' })
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => LineaSueltaDto)
  lineas: LineaSueltaDto[];

  // La escribe recepción: va al comienzo de la descripción de cada línea
  // (el PDF de la boleta no imprime las observaciones, paso 0 del 06-11).
  @IsOptional()
  @IsString()
  @MaxLength(22, { message: 'La cabaña cabe en 22 caracteres' })
  cabana?: string | null;

  @IsOptional()
  @ValidateIf((o: { correo?: string | null }) => !!o.correo)
  @IsEmail({}, { message: 'Ese correo no es válido' })
  @MaxLength(200)
  correo?: string | null;
}
