import {
  IsEmail,
  IsNotEmpty,
  IsOptional,
  IsString,
  ValidateIf,
} from 'class-validator';

export class CreateClientDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  // Correo OPCIONAL (Clientes 2.0, 22-07): las empresas no llevan correo
  // propio — vive en sus personas de contacto — y en particulares es
  // opcional. Si viene con contenido, debe ser un correo válido.
  @ValidateIf(
    (o: { email?: string | null }) =>
      o.email !== undefined && o.email !== null && o.email !== '',
  )
  @IsEmail()
  email?: string;

  @IsString()
  @IsOptional()
  phone: string;

  @IsString()
  @IsNotEmpty()
  client_type: string;

  @IsString()
  @IsOptional()
  address?: string;

  @IsString()
  @IsOptional()
  contact_person?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  // Datos de la PERSONA principal (fuente de verdad, 31-07): el
  // backend siembra la persona al crear el cliente; estos campos
  // permiten que lleguen su correo/teléfono desde cualquier formulario.
  @ValidateIf(
    (o: { contact_email?: string | null }) =>
      o.contact_email !== undefined &&
      o.contact_email !== null &&
      o.contact_email !== '',
  )
  @IsEmail()
  contact_email?: string;

  @IsString()
  @IsOptional()
  contact_phone?: string;
}
