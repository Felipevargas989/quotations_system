import { IsNotEmpty, IsString } from 'class-validator';
import { Company } from 'src/companies/entities/company.entity';

export class SignupDto {
  @IsString()
  @IsNotEmpty()
  admin_email: string;

  @IsString()
  @IsNotEmpty()
  admin_password: string;

  @IsString()
  @IsNotEmpty()
  admin_full_name: string;

  @IsString()
  @IsNotEmpty()
  company_name: Company['name'];
}
