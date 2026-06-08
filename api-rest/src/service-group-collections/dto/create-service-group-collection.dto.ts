import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from 'class-validator';
import {
  ServiceGroupCollection,
  ServiceGroupCollectionItem,
} from '../entities/service-group-collection.entity';

export class CreateServiceGroupCollectionItemDto {
  @IsInt()
  @IsNotEmpty()
  service_group_id: ServiceGroupCollectionItem['service_group_id'];
}

export class CreateServiceGroupCollectionDto {
  @IsString()
  @IsNotEmpty()
  name: ServiceGroupCollection['name'];

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => CreateServiceGroupCollectionItemDto)
  items: CreateServiceGroupCollectionItemDto[];
}
