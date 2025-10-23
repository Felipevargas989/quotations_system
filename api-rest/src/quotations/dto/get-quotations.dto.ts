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
}
