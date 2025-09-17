import { IsArray, IsNotEmpty } from 'class-validator';
import { FixedService, VariableService } from '../entities/service.entity';

export class CreateServicesBulkDto {
  @IsArray()
  @IsNotEmpty()
  variable_services: VariableService[];

  @IsArray()
  @IsNotEmpty()
  fixed_services: FixedService[];
}
