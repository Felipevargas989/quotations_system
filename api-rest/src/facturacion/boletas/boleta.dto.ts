import { PartialType } from '@nestjs/mapped-types';
import {
  IsEmail,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  Min,
  ValidateIf,
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
