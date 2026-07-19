import { IsDateString, IsNotEmpty, IsOptional } from 'class-validator';

export class CheckConflictsWithExistingQuotationsDto {
  @IsDateString()
  @IsNotEmpty()
  event_date: string; // <- keep as string

  // Último día del evento (opcional): el choque se evalúa por rango.
  @IsDateString()
  @IsOptional()
  event_end_date?: string;
}
