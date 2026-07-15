import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';
import { VariableService } from '../entities/service.entity';

export class CreateVariableServiceDto {
  @IsString()
  @IsOptional()
  code: VariableService['code'];

  @IsString()
  @IsNotEmpty()
  name: VariableService['name'];

  @IsNumber()
  @IsNotEmpty()
  price: VariableService['price'];

  @IsString()
  @IsNotEmpty()
  category: VariableService['category'];

  @IsBoolean()
  @IsOptional()
  is_active?: VariableService['is_active'];
}
