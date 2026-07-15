import {
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { CalculationType } from '../constants';
import { FixedService } from '../entities/service.entity';

export class CreateFixedServiceDto {
  @IsString()
  @IsOptional()
  code: FixedService['code'];

  @IsString()
  @IsNotEmpty()
  name: FixedService['name'];

  @IsNumber()
  @IsOptional()
  price: FixedService['price'];

  @IsEnum(CalculationType)
  @IsString()
  @IsNotEmpty()
  calculation_type: FixedService['calculation_type'];

  @IsNumber()
  @IsOptional()
  min_price: FixedService['min_price'];

  @IsNumber()
  @IsOptional()
  max_price: FixedService['max_price'];

  @IsNumber()
  @IsOptional()
  price_per_person: FixedService['price_per_person'];

  @IsBoolean()
  @IsOptional()
  is_active?: FixedService['is_active'];
}
