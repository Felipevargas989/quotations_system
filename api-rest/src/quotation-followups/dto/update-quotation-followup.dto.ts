import { OmitType, PartialType } from '@nestjs/mapped-types';
import { CreateQuotationFollowupDto } from './create-quotation-followup.dto';

// Editar no mueve la nota de cotización: quotation_id queda fuera (con
// el ValidationPipe global, mandarlo en el PATCH es rechazo directo).
export class UpdateQuotationFollowupDto extends PartialType(
  OmitType(CreateQuotationFollowupDto, ['quotation_id'] as const),
) {}
