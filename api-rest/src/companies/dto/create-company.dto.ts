import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { Company } from '../entities/company.entity';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  name: Company['name'];

  @IsString()
  @IsOptional()
  logo_url: Company['logo_url'];

  @IsObject()
  @IsOptional()
  colors: Company['colors'];

  @IsObject()
  @IsOptional()
  notifications: Company['notifications'];
}
