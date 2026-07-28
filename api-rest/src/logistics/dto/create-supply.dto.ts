import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

// Mudanza #3 "una sola puerta" (28-07): INSUMOS por el backend.
// company_id NO viaja: sale de la sesión.
export class CreateSupplyDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  unit_family: string;

  @IsNumber()
  price: number;

  @IsNumber()
  @IsOptional()
  supplier_id?: number | null;

  @IsNumber()
  @IsOptional()
  waste_pct?: number;

  @IsString()
  @IsOptional()
  package_name?: string | null;

  @IsNumber()
  @IsOptional()
  package_qty?: number | null;

  @IsNumber()
  @IsOptional()
  package_price?: number | null;
}

export class UpdateSupplyDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  unit_family?: string;

  @IsNumber()
  @IsOptional()
  price?: number;

  @IsNumber()
  @IsOptional()
  supplier_id?: number | null;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsNumber()
  @IsOptional()
  waste_pct?: number;

  @IsString()
  @IsOptional()
  package_name?: string | null;

  @IsNumber()
  @IsOptional()
  package_qty?: number | null;

  @IsNumber()
  @IsOptional()
  package_price?: number | null;
}
