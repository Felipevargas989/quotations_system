import { IntersectionType, OmitType } from '@nestjs/mapped-types';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { CreateClientDto } from 'src/clients/dto/create-client.dto';
import { CreateQuotationDto } from './create-quotation.dto';

export class CreateQuotationPublicDto extends IntersectionType(
  OmitType(CreateQuotationDto, [
    'client_id',
    'quotation_status',
    'request_type',
  ] as const),
  CreateClientDto,
) {
  // Puerta del SERVIDOR cerrada (regla de Felipe 30-07): en el
  // formulario público el correo y el teléfono son obligatorios —
  // el formulario web ya lo exigía; ahora la API también, por si
  // alguien le habla directo.
  @IsEmail()
  @IsNotEmpty()
  declare email: string;

  @IsString()
  @IsNotEmpty()
  declare phone: string;
}
