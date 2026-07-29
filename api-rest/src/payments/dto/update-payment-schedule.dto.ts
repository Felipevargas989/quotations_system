import { IsDateString, IsOptional, IsString, MaxLength } from 'class-validator';

// Calendario de pagos, Nivel A (29-07): por esta puerta SOLO se editan
// la fecha de vencimiento y la nota de una cuota SIN dinero registrado.
// El monto y la estructura del plan no se tocan aquí.
export class UpdatePaymentScheduleDto {
  @IsOptional()
  @IsDateString(
    {},
    { message: 'La fecha de vencimiento debe tener formato AAAA-MM-DD' },
  )
  due_date?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'La nota no puede superar los 300 caracteres' })
  notes?: string;
}
