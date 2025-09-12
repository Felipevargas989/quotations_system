import {
  IsDateString,
  IsIn,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { EventType } from '../constants/constants';

export class CreateQuotationDto {
  @IsString()
  @IsNotEmpty()
  client_id: string;

  @IsString()
  @IsNotEmpty()
  // check if value has any of the values of the EventType enum
  @IsIn(Object.values(EventType))
  event_type: string;

  @IsDateString()
  @IsNotEmpty()
  event_date: Date;

  @IsNumber()
  @IsNotEmpty()
  people_count: number;

  @IsString()
  @IsOptional()
  observations: string;
}
