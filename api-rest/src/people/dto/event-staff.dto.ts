import {
  IsBoolean,
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
  /** Cambio de día de la planta (migración 89): el calendario de la
   *  persona crea el día agregado ya marcado 'trabaja'. */
  @IsOptional()
  @IsIn(['trabaja', 'descansa'])
  ajuste?: 'trabaja' | 'descansa';

  // Sin evento = RESTAURANTE, el evento permanente (15-08).
  @IsOptional()
  @IsUUID()
  quotation_id?: string | null;

  /** Sin persona = SILLA VACÍA: cupo planificado sin nombre (migración
   *  84). Cuenta para el costo del evento, jamás para la nómina. */
  @IsOptional()
  @IsInt()
  person_id?: number | null;

  /** Sin día solo en eventos: es el "por ubicar" del plan. */
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'El día va como 2026-08-14' })
  day?: string | null;

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
  // Sin propina ese día: el reparto se salta esta fila.
  @IsOptional()
  @IsBoolean()
  no_tip?: boolean;

  /** Cambio de día de la planta (migración 89). NULL = volver a normal. */
  @IsOptional()
  @IsIn(['trabaja', 'descansa'])
  ajuste?: 'trabaja' | 'descansa' | null;

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
