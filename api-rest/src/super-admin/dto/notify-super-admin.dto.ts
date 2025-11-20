import { IsNotEmpty, IsString } from 'class-validator';

export class NotifySuperAdminDto {
  @IsString()
  @IsNotEmpty()
  content: string;
}
