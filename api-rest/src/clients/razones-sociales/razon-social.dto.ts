import { PartialType } from '@nestjs/mapped-types';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Validate,
  ValidateIf,
  ValidatorConstraint,
  ValidatorConstraintInterface,
  isEmail,
} from 'class-validator';
import { LARGO_MAXIMO, correosDe } from '../../facturacion/datos-del-receptor';
import { CODIGOS_DE_REFERENCIA } from '../../facturacion/referencias';
import { RutChileno } from '../../people/dto/create-person.dto';

/** Los correos de facturación: uno o varios, todos válidos. */
@ValidatorConstraint({ name: 'correosDeFacturacion', async: false })
export class CorreosDeFacturacion implements ValidatorConstraintInterface {
  validate(valor: unknown) {
    if (typeof valor !== 'string') return false;
    const correos = correosDe(valor);
    return correos.length > 0 && correos.every((c) => isEmail(c));
  }
  defaultMessage() {
    return 'Revisa los correos de facturación: uno o varios, separados por coma';
  }
}

const cabeEnLaFactura = (que: string, largo: number) => ({
  message: `${que} no puede pasar de ${largo} caracteres: es lo que cabe en la factura`,
});

/**
 * UNA RAZÓN SOCIAL DEL CLIENTE: a quién se le factura (migración 184, doc 19
 * §9.12). Los largos son los del archivo de facturacion.cl: lo que se guarda
 * cabe entero en la factura. El RUT se revisa de verdad, igual que en
 * Personas.
 */
export class CrearRazonSocialDto {
  @Validate(RutChileno)
  rut: string;

  @IsString()
  @IsNotEmpty({ message: 'Falta la razón social' })
  @MaxLength(
    LARGO_MAXIMO.razon_social,
    cabeEnLaFactura('La razón social', LARGO_MAXIMO.razon_social),
  )
  razon_social: string;

  @IsOptional()
  @IsString()
  @MaxLength(LARGO_MAXIMO.giro, cabeEnLaFactura('El giro', LARGO_MAXIMO.giro))
  giro?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(
    LARGO_MAXIMO.direccion,
    cabeEnLaFactura('La dirección', LARGO_MAXIMO.direccion),
  )
  direccion?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(
    LARGO_MAXIMO.comuna,
    cabeEnLaFactura('La comuna', LARGO_MAXIMO.comuna),
  )
  comuna?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(
    LARGO_MAXIMO.ciudad,
    cabeEnLaFactura('La ciudad', LARGO_MAXIMO.ciudad),
  )
  ciudad?: string | null;

  @ValidateIf(
    (o: { correo_facturacion?: string | null }) => !!o.correo_facturacion,
  )
  @Validate(CorreosDeFacturacion)
  @MaxLength(
    LARGO_MAXIMO.correo_facturacion,
    cabeEnLaFactura('Los correos', LARGO_MAXIMO.correo_facturacion),
  )
  correo_facturacion?: string | null;

  // Lo que exige en su factura (CCU: '801' y '802').
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CODIGOS_DE_REFERENCIA.length)
  @IsIn(CODIGOS_DE_REFERENCIA, {
    each: true,
    message: 'Esa referencia no está en la lista del SII',
  })
  referencias_exigidas?: string[];
}

export class EditarRazonSocialDto extends PartialType(CrearRazonSocialDto) {}
