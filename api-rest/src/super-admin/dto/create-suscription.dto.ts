import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { Company } from 'src/companies/entities/company.entity';
import { User } from 'src/users/entities/user.entity';

export class CreateSuscriptionDto {
  @IsString()
  @IsNotEmpty()
  admin_email: User['email'];

  @IsString()
  @IsNotEmpty()
  admin_password: string;

  @IsString()
  @IsNotEmpty()
  admin_full_name: User['full_name'];

  // Tope de largo (cura 05-08): puerta pública y el nombre viaja a un
  // correo de alerta.
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  company_name: Company['name'];

  @IsString()
  @IsNotEmpty()
  currency: Company['currency'];
}
