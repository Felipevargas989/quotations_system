import {
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
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

  // Migración 160: el % de abono para reservar la fecha (0 a 100; null o 0
  // = la hoja de la cotización no muestra la línea).
  @IsNumber()
  @Min(0)
  @Max(100)
  @IsOptional()
  abono_reserva_pct?: number | null;

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
