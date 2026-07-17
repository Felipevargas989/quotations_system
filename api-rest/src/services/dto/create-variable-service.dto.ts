import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { VariableService } from '../entities/service.entity';

export class CreateVariableServiceDto {
  @IsString()
  @IsOptional()
  code?: VariableService['code'];

  @IsString()
  @IsNotEmpty()
  name: VariableService['name'];

  @IsNumber()
  @IsNotEmpty()
  price: VariableService['price'];

  // Legacy single-category field (kept for backward compatibility). New clients
  // send category_ids instead.
  @IsString()
  @IsOptional()
  category?: VariableService['category'];

  // Categories this service belongs to (multi-category). At least one required.
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  @IsOptional()
  category_ids?: number[];

  @IsBoolean()
  @IsOptional()
  is_active?: VariableService['is_active'];
}
