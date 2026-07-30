import { IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { Company } from '../entities/company.entity';

export class CreateCompanyDto {
  @IsString()
  @IsNotEmpty()
  name: Company['name'];

  @IsString()
  @IsOptional()
  logo_url: Company['logo_url'];

  @IsString()
  @IsOptional()
  tagline: Company['tagline'];

  @IsObject()
  @IsOptional()
  colors: Company['colors'];

  @IsObject()
  @IsOptional()
  bank_details: Company['bank_details'];

  @IsObject()
  @IsOptional()
  notifications: Company['notifications'];
}
