import { IsDateString, IsNotEmpty } from 'class-validator';

export class CheckConflictsWithExistingQuotationsDto {
  @IsDateString()
  @IsNotEmpty()
  event_date: string; // <- keep as string
}
