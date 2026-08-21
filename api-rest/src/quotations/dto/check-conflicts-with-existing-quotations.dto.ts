import { IsDateString, IsNotEmpty, IsOptional, IsUUID } from 'class-validator';

export class CheckConflictsWithExistingQuotationsDto {
  @IsDateString()
  @IsNotEmpty()
  event_date: string; // <- keep as string

  // Último día del evento (opcional): el choque se evalúa por rango.
  @IsDateString()
  @IsOptional()
  event_end_date?: string;

  // Al EDITAR, la propia cotización/requerimiento no es un choque
  // (Felipe, 18-08: "el requerimiento se cuenta a él solo").
  @IsUUID()
  @IsOptional()
  exclude_id?: string;
}
