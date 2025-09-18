import { IsNotEmpty, IsString } from 'class-validator';
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

  @IsString()
  @IsNotEmpty()
  company_name: Company['name'];
}
