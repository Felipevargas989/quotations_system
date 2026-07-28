import { IsEmail, IsNotEmpty, IsOptional, IsString } from 'class-validator';

// Mudanza #1 de "una sola puerta" (28-07): el formulario de la landing
// ya no escribe directo a Supabase — pasa por acá, con validación real
// (antes cualquiera podía insertar cualquier cosa en la tabla leads).
export class RegisterLeadDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsString()
  @IsNotEmpty()
  telefono: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  nombre_empresa?: string;

  @IsString()
  @IsOptional()
  personas_empresa?: string;

  @IsString()
  @IsOptional()
  ventas_anuales?: string;
}
