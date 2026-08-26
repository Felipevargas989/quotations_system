import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
} from 'class-validator';
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

  @IsNumber()
  @IsOptional()
  high_value_threshold?: Company['high_value_threshold'];

  // Migraciones 95 y 96: marca para los correos de marketing.
  @IsString()
  @IsOptional()
  banner_url?: Company['banner_url'];

  @IsString()
  @IsOptional()
  whatsapp?: Company['whatsapp'];

  @IsString()
  @IsOptional()
  instagram?: Company['instagram'];

  @IsString()
  @IsOptional()
  facebook?: Company['facebook'];

  @IsString()
  @IsOptional()
  sitio_web?: Company['sitio_web'];
}
