import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  ServiceGroupCollection,
  ServiceGroupCollectionItem,
  ServiceGroupCollectionService,
} from '../entities/service-group-collection.entity';

export class CreateServiceGroupCollectionItemDto {
  @IsInt()
  @IsNotEmpty()
  service_group_id: ServiceGroupCollectionItem['service_group_id'];
}

export class CreateServiceGroupCollectionServiceDto {
  @IsInt()
  @IsNotEmpty()
  variable_service_id: ServiceGroupCollectionService['variable_service_id'];

  @IsInt()
  @Min(1)
  quantity: ServiceGroupCollectionService['quantity'];
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

  // Servicios sueltos del paquete: alojamiento, fiesta, lo que no sea
  // un menú. Opcional — un paquete puede ser solo de menús.
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateServiceGroupCollectionServiceDto)
  services?: CreateServiceGroupCollectionServiceDto[];
}
