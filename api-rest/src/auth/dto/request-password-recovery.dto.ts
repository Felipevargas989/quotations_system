import { IsEmail, IsNotEmpty } from 'class-validator';

export class RequestPasswordRecoveryDto {
  @IsEmail()
  @IsNotEmpty()
  email!: string;
}
