import { IsOptional, IsString, MaxLength } from 'class-validator';

// El aviso mientras se escribe (Felipe, 16-10-2026: "mejor cuando apenas
// termine de escribir, es más rápido"): los datos a medio escribir de la
// ventana "Crear nuevo cliente". Sin @IsEmail a propósito: el correo puede
// venir incompleto mientras la persona todavía escribe.
export class RevisarClienteDto {
  @IsString()
  @IsOptional()
  @MaxLength(200)
  name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  contact_email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  contact_phone?: string;
}
