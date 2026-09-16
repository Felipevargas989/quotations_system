import {
  IsEmail,
  IsNotEmpty,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { Company } from 'src/companies/entities/company.entity';
import { User } from 'src/users/entities/user.entity';

// EL ALTA POR CUENTA PROPIA (16-09-2026, paso 4 del roadmap de venta).
// Esta es LA puerta pública del registro: cualquiera en internet puede
// pegarle (con su techo de 10/min), así que cada campo lleva su tope y
// su forma. La hermana manual, /super-admin/suscription, quedó solo
// para Felipe.
export class SignupDto {
  @IsEmail({}, { message: 'El correo no parece válido' })
  @MaxLength(200)
  admin_email: User['email'];

  // El mínimo de 8 es nuestro; Supabase acepta desde 6, pero una puerta
  // pública no regala cuentas con contraseñas de juguete.
  @IsString()
  @IsNotEmpty()
  @MinLength(8, { message: 'La contraseña necesita al menos 8 caracteres' })
  @MaxLength(72)
  admin_password: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  admin_full_name: User['full_name'];

  // Tope de largo (cura 05-08): puerta pública y el nombre viaja a un
  // correo de alerta.
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  company_name: Company['name'];

  @IsString()
  @IsNotEmpty()
  @MaxLength(8)
  currency: Company['currency'];
}
