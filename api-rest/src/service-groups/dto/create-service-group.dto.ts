import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ServiceGroup,
  ServiceGroupItem,
} from '../entities/service-group.entity';

export class CreateServiceGroupItemDto {
  @IsInt()
  @IsNotEmpty()
  variable_service_id: ServiceGroupItem['variable_service_id'];

  @IsInt()
  @Min(1)
  quantity: ServiceGroupItem['quantity'];
}

export class CreateServiceGroupDto {
  @IsString()
  @IsNotEmpty()
  name: ServiceGroup['name'];

  @IsString()
  @IsNotEmpty()
  category: ServiceGroup['category'];

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateServiceGroupItemDto)
  items: CreateServiceGroupItemDto[];
}
