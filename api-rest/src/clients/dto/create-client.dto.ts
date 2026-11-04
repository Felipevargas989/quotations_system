import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsEmail,
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

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  // Correo OPCIONAL (Clientes 2.0, 22-07): las empresas no llevan correo
  // propio — vive en sus personas de contacto — y en particulares es
  // opcional. Si viene con contenido, debe ser un correo válido.
  @ValidateIf(
    (o: { email?: string | null }) =>
      o.email !== undefined && o.email !== null && o.email !== '',
  )
  @IsEmail()
  email?: string;

  @IsString()
  @IsOptional()
  phone: string;

  @IsString()
  @IsNotEmpty()
  client_type: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  contact_person?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  // Datos de la PERSONA principal (fuente de verdad, 31-07): el
  // backend siembra la persona al crear el cliente; estos campos
  // permiten que lleguen su correo/teléfono desde cualquier formulario.
  @ValidateIf(
    (o: { contact_email?: string | null }) =>
      o.contact_email !== undefined &&
      o.contact_email !== null &&
      o.contact_email !== '',
  )
  @IsEmail()
  contact_email?: string;

  @IsString()
  @IsOptional()
  contact_phone?: string;

  // Respuesta al aviso de cliente parecido (16-10-2026): la persona
  // revisó las coincidencias y dijo "es otro cliente, crear igual".
  @IsBoolean()
  @IsOptional()
  confirmado?: boolean;

  // ---- Datos de facturación (migración 184, doc 19 §5.1) ----
  // Todos opcionales, y se borran mandando null o ''. Los largos son los
  // del archivo de facturacion.cl: lo que se guarda cabe entero en la
  // factura. El RUT se revisa de verdad, igual que en Personas.
  @ValidateIf((o: { rut?: string | null }) => !!o.rut)
  @Validate(RutChileno)
  rut?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(
    LARGO_MAXIMO.razon_social,
    cabeEnLaFactura('La razón social', LARGO_MAXIMO.razon_social),
  )
  razon_social?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(LARGO_MAXIMO.giro, cabeEnLaFactura('El giro', LARGO_MAXIMO.giro))
  giro?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(
    LARGO_MAXIMO.direccion_facturacion,
    cabeEnLaFactura('La dirección', LARGO_MAXIMO.direccion_facturacion),
  )
  direccion_facturacion?: string | null;

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

  // Lo que el cliente exige en su factura (CCU: '801' y '802').
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(CODIGOS_DE_REFERENCIA.length)
  @IsIn(CODIGOS_DE_REFERENCIA, {
    each: true,
    message: 'Esa referencia no está en la lista del SII',
  })
  referencias_exigidas?: string[];
}
