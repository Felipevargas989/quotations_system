import { IntersectionType, OmitType } from '@nestjs/mapped-types';
import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { CreateClientDto } from 'src/clients/dto/create-client.dto';
import { CreateQuotationDto } from './create-quotation.dto';

export class CreateQuotationPublicDto extends IntersectionType(
  OmitType(CreateQuotationDto, [
    'client_id',
    'quotation_status',
    'request_type',
  ] as const),
  // El correo/teléfono del cliente son opcionales EN GENERAL (Clientes
  // 2.0), pero acá se REDEFINEN obligatorios — por eso se omiten del
  // padre: heredarlos arrastraba su ValidateIf, que salta la validación
  // justo cuando el correo viene vacío (hoyo pillado el 30-07).
  OmitType(CreateClientDto, ['email', 'phone'] as const),
) {
  // Puerta del SERVIDOR cerrada (regla de Felipe 30-07): en el
  // formulario público el correo y el teléfono son obligatorios —
  // el formulario web ya lo exigía; ahora la API también, por si
  // alguien le habla directo.
  @IsEmail()
  @IsNotEmpty()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  /** Empresa o institución (05-09): "tus datos" son LA PERSONA de
   *  contacto; si esto viene, el CLIENTE se nombra por la empresa y
   *  la persona queda como su contacto principal. Vacío = el cliente
   *  es la persona, como siempre (particulares). */
  @IsOptional()
  @IsString()
  @MaxLength(160)
  company_name?: string;
}
