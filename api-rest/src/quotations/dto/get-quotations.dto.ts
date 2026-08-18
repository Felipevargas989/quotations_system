import { Transform } from 'class-transformer';
import { IsArray, IsEnum, IsIn, IsOptional, IsString } from 'class-validator';
import { QuotationStatus, RequestType } from '../constants/constants';

export class GetQuotationsDto {
  @IsOptional()
  @IsEnum(RequestType)
  request_type?: RequestType;

  @IsOptional()
  @Transform(({ value }) => {
    if (!value) return [];
    if (Array.isArray(value)) return value as QuotationStatus[];
    if (typeof value === 'string') return value.split(',') as QuotationStatus[];
  })
  @IsArray()
  @IsIn(Object.values(QuotationStatus), { each: true })
  statuses?: QuotationStatus[];

  @IsOptional()
  @IsString()
  sort_by?: 'quotation_number' | 'event_date' | 'status';

  @IsOptional()
  @IsString()
  sort_order?: 'asc' | 'desc';

  /** Solo eventos desde esta fecha (YYYY-MM-DD). Personal la usa para
   *  no cargar 146 cotizaciones históricas solo para poner el nombre
   *  del cliente al lado de un evento (17-08). */
  @IsOptional()
  @IsString()
  event_date_from?: string;
}
