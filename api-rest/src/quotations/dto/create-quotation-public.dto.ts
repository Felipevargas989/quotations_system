import { IntersectionType, OmitType } from '@nestjs/mapped-types';
import { CreateClientDto } from 'src/clients/dto/create-client.dto';
import { CreateQuotationDto } from './create-quotation.dto';

export class CreateQuotationPublicDto extends IntersectionType(
  OmitType(CreateQuotationDto, [
    'client_id',
    'quotation_status',
    'request_type',
  ] as const),
  CreateClientDto,
) {}
