import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// Mudanza #1 de "una sola puerta" (28-07): el formulario de la landing
// ya no escribe directo a Supabase — pasa por acá, con validación real
// (antes cualquiera podía insertar cualquier cosa en la tabla leads).
// Topes de largo (cura 05-08): es una puerta pública.
export class RegisterLeadDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  nombre: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  telefono: string;

  @IsEmail()
  @MaxLength(200)
  email: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  nombre_empresa?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  personas_empresa?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  ventas_anuales?: string;
}
