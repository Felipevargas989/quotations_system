import {
  IsBoolean,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

// Mudanzas #4 y #5 de "una sola puerta" (28-07): MOBILIARIO y RECURSOS
// DE GESTIÓN por el backend. company_id NO viaja: sale de la sesión.

export class CreateFurnitureItemDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  category?: string;

  @IsNumber()
  @IsOptional()
  stock?: number;

  @IsString()
  @IsOptional()
  photo_url?: string | null;

  @IsBoolean()
  @IsOptional()
  preassembled?: boolean;

  // Costo unitario de reposición: inventario valorizado = stock × costo
  // (Felipe, 15-08).
  @IsNumber()
  @IsOptional()
  unit_cost?: number | null;
}

export class UpdateFurnitureItemDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsString()
  @IsOptional()
  category?: string;

  @IsNumber()
  @IsOptional()
  stock?: number;

  @IsString()
  @IsOptional()
  photo_url?: string | null;

  @IsBoolean()
  @IsOptional()
  preassembled?: boolean;

  @IsNumber()
  @IsOptional()
  unit_cost?: number | null;
}

export class CreateManagementResourceDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  type: string;

  @IsNumber()
  @IsOptional()
  supplier_id?: number | null;

  @IsNumber()
  @IsOptional()
  list_price_fixed?: number | null;

  @IsNumber()
  @IsOptional()
  list_price_per_person?: number | null;
}

export class UpdateManagementResourceDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  type?: string;

  @IsNumber()
  @IsOptional()
  last_price?: number | null;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsNumber()
  @IsOptional()
  supplier_id?: number | null;

  @IsNumber()
  @IsOptional()
  list_price_fixed?: number | null;

  @IsNumber()
  @IsOptional()
  list_price_per_person?: number | null;
}
