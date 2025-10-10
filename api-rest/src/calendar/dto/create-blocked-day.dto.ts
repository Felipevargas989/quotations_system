import { IsDateString, IsNotEmpty } from 'class-validator';

export class CreateBlockedDayDto {
  @IsDateString()
  @IsNotEmpty()
  date: string;
}
