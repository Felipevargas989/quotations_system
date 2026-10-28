import { Type } from 'class-transformer';
import {
  IsArray,
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { Quotation } from 'src/quotations/entities/quotation.entity';

// «Editar plan de pagos» de Post-Venta (doc 14 §Editar el plan, 28-10-2026):
// llegan SOLO las cuotas sin plata, en su orden. Las que tienen pagos no
// viajan: el motor las conserva tal cual.
export class CuotaDelPlanDto {
  @IsString()
  @IsNotEmpty({ message: 'Cada cuota necesita un comentario' })
  @MaxLength(80, {
    message: 'El comentario no puede superar los 80 caracteres',
  })
  payment_type: string;

  @IsDateString(
    {},
    { message: 'La fecha de vencimiento debe tener formato AAAA-MM-DD' },
  )
  due_date: string;

  @IsInt({ message: 'El monto de cada cuota va en pesos enteros' })
  @Min(1, { message: 'El monto de cada cuota debe ser mayor que cero' })
  amount: number;

  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'La nota no puede superar los 300 caracteres' })
  notes?: string;
}

export class EditarPlanDto {
  @IsString()
  @IsNotEmpty()
  quotation_id: Quotation['id'];

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CuotaDelPlanDto)
  cuotas: CuotaDelPlanDto[];
}
