import {
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
} from 'class-validator';

/** Una persona trabajando un día de un evento. El cargo y planta/freelance
 *  se guardan acá porque son valores DEL DÍA, no de la persona. */
export class CreateEventStaffDto {
  // Sin evento = RESTAURANTE, el evento permanente (15-08).
  @IsOptional()
  @IsUUID()
  quotation_id?: string | null;

  @IsInt()
  person_id: number;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'El día va como 2026-08-14' })
  day: string;

  @IsOptional()
  @IsInt()
  role_id?: number | null;

  @IsOptional()
  @IsIn(['planta', 'freelance'])
  kind?: string;

  @IsOptional()
  @IsIn(['confirmado', 'por_confirmar'])
  status?: string;

  @IsOptional()
  @IsNumber()
  amount?: number | null;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  starts_at?: string | null;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  ends_at?: string | null;

  @IsOptional()
  @IsInt()
  break_minutes?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}

export class UpdateEventStaffDto {
  // Mover la asignación a OTRO día (Felipe, 15-08: "pasa mucho que
  // cambiamos días para adecuarnos al trabajo").
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'El día va como 2026-08-14' })
  day?: string;

  @IsOptional()
  @IsInt()
  role_id?: number | null;

  @IsOptional()
  @IsIn(['planta', 'freelance'])
  kind?: string;

  @IsOptional()
  @IsIn(['confirmado', 'por_confirmar'])
  status?: string;

  @IsOptional()
  @IsNumber()
  amount?: number | null;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  starts_at?: string | null;

  @IsOptional()
  @Matches(/^\d{2}:\d{2}$/)
  ends_at?: string | null;

  @IsOptional()
  @IsInt()
  break_minutes?: number | null;

  @IsOptional()
  @IsString()
  notes?: string | null;
}
