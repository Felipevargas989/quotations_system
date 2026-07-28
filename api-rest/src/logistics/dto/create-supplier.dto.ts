import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Mudanza #2 "una sola puerta" (28-07): proveedores por el backend.
// company_id NO viaja en el body: sale de la sesión (aislamiento).
export class CreateSupplierDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  contact_name?: string | null;

  @IsString()
  @IsOptional()
  phone?: string | null;

  @IsString()
  @IsOptional()
  notes?: string | null;
}

export class UpdateSupplierDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  contact_name?: string | null;

  @IsString()
  @IsOptional()
  phone?: string | null;

  @IsString()
  @IsOptional()
  notes?: string | null;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
