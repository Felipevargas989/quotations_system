import { IsBoolean, IsNotEmpty, IsString } from 'class-validator';
import { ServiceCategory } from '../entities/service.entity';

// Toggle the activation state of a whole category (by name, scoped per company).
export class UpdateServiceCategoryDto {
  @IsString()
  @IsNotEmpty()
  name: ServiceCategory['name'];

  @IsBoolean()
  @IsNotEmpty()
  is_active: ServiceCategory['is_active'];
}
