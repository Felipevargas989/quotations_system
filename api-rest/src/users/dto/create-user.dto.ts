import { IsEmail, IsEnum, IsNotEmpty, IsString } from 'class-validator';
import { User, UserRole } from '../entities/user.entity';

export class CreateUserDto {
  @IsEmail()
  @IsNotEmpty()
  email: User['email'];

  @IsString()
  @IsNotEmpty()
  password: string;

  @IsString()
  @IsNotEmpty()
  full_name: User['full_name'];

  @IsEnum(UserRole)
  @IsNotEmpty()
  role: UserRole;
}
