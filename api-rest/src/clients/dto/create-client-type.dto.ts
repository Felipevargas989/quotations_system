import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateClientTypeDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(60)
  name: string;
}
