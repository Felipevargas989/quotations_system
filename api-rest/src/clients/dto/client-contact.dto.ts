import {
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

// Mudanza #7 (28-07): contactos de cliente por el backend.
// company_id sale de la sesión; el original editaba solo por id.
export class CreateClientContactDto {
  @IsUUID()
  client_id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsOptional()
  email?: string | null;

  @IsString()
  @IsOptional()
  phone?: string | null;

  @IsBoolean()
  @IsOptional()
  is_primary?: boolean;
}

export class UpdateClientContactDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  email?: string | null;

  @IsString()
  @IsOptional()
  phone?: string | null;
}
