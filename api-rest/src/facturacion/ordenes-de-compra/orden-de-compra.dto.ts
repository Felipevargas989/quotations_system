import { PartialType } from '@nestjs/mapped-types';
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
  Validate,
  ValidateIf,
  ValidateNested,
} from 'class-validator';
import { RutChileno } from '../../people/dto/create-person.dto';

/** Lo que la OC dice del comprador y no tiene casilla propia, como lo leyó
 *  BelIA (paso 2b). Los largos son los de lo leído: al facturar, la persona
 *  lo ajusta a lo que cabe en la factura (doc 19 §9.12). */
export class CompradorDeLaOCDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  giro?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  direccion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  comuna?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(40)
  ciudad?: string | null;
}

/**
 * UNA ORDEN DE COMPRA DEL EVENTO (migración 184, doc 19 §9.2 y §9.12).
 *
 * El N° va tal cual en la referencia 801 de la factura, y el SII admite ahí
 * hasta 18 letras o números. A nombre de quién viene (RUT y razón social) es
 * a quién se le factura esa OC: Santo Tomás manda OC del CFT y del Instituto
 * Profesional para un mismo evento. Con OC, la factura va por el total de la
 * OC (E1); el neto y el IVA, si la OC los trae (L17).
 */
export class CrearOrdenDeCompraDto {
  @IsString()
  @IsNotEmpty({ message: 'Falta el N° de la orden de compra' })
  @MaxLength(18, {
    message:
      'El N° de la OC no puede pasar de 18 caracteres: es lo que admite la referencia del SII',
  })
  numero: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'La fecha de la OC va como AAAA-MM-DD',
  })
  fecha: string;

  @ValidateIf((o: { rut?: string | null }) => !!o.rut)
  @Validate(RutChileno)
  rut?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(100, {
    message: 'La razón social no puede pasar de 100 caracteres',
  })
  razon_social?: string | null;

  @IsOptional()
  @ValidateNested()
  @Type(() => CompradorDeLaOCDto)
  comprador?: CompradorDeLaOCDto | null;

  @IsOptional()
  @IsString()
  @MaxLength(1000, {
    message: 'El detalle de la OC no puede pasar de 1.000 caracteres',
  })
  descripcion?: string | null;

  @IsOptional()
  @IsInt({ message: 'El neto va en pesos, sin decimales' })
  @Min(0)
  neto?: number | null;

  @IsOptional()
  @IsInt({ message: 'El IVA va en pesos, sin decimales' })
  @Min(0)
  iva?: number | null;

  @IsInt({ message: 'El total va en pesos, sin decimales' })
  @Min(1, { message: 'El total de la OC tiene que ser mayor que cero' })
  total: number;

  // El PDF de la OC en Documentos del mismo evento.
  @IsOptional()
  @IsInt()
  documento_id?: number | null;

  // De dónde salió: escrita a mano, o leída por BelIA del PDF y confirmada.
  @IsOptional()
  @IsIn(['manual', 'pdf'])
  origen?: 'manual' | 'pdf';
}

/** «✨ Leer con BelIA»: el PDF de Documentos que hay que leer. */
export class LeerOrdenDeCompraDto {
  @IsInt({ message: 'Falta el PDF de la orden de compra' })
  documento_id: number;
}

export class EditarOrdenDeCompraDto extends PartialType(
  CrearOrdenDeCompraDto,
) {}
