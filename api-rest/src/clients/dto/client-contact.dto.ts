import {
  IsBoolean,
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ValidateIf,
} from 'class-validator';

// Mudanza #7 (28-07): contactos de cliente por el backend.
// company_id sale de la sesión; el original editaba solo por id.
// Candado de correo (03-08, pillada de Felipe: "payasoqlflojo@" quedó
// guardado): si viene correo, debe ser un correo de verdad — un correo
// inválido guardado hoy es un envío que rebota mañana. Vacío/null pasa
// (una persona puede ir sin correo). El teléfono queda libre a
// propósito (formatos extranjeros legítimos).
const conCorreo = (o: { email?: string | null }) =>
  o.email !== undefined && o.email !== null && o.email !== '';

export class CreateClientContactDto {
  @IsUUID()
  client_id: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @ValidateIf(conCorreo)
  @IsEmail({}, { message: 'El correo de la persona no parece válido' })
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

  @ValidateIf(conCorreo)
  @IsEmail({}, { message: 'El correo de la persona no parece válido' })
  email?: string | null;

  @IsString()
  @IsOptional()
  phone?: string | null;
}
