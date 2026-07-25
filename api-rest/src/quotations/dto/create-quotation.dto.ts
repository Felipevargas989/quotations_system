import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  EventType,
  PaymentPlanType,
  QuotationStatus,
  RequestType,
} from '../constants/constants';
import type { QuotationItem } from '../entities/quotation.entity';

export class CreateQuotationDto {
  @IsString()
  @IsNotEmpty()
  client_id: string;

  @IsEnum(EventType)
  @IsNotEmpty()
  event_type: EventType;

  @IsDateString()
  @IsNotEmpty()
  event_date: string; // <- keep as string

  // Último día del evento (opcional): null = evento de un solo día.
  @IsDateString()
  @IsOptional()
  event_end_date?: string | null;

  @IsNumber()
  @IsNotEmpty()
  @Min(1, { message: 'People count must be at least 1' })
  people_count: number;

  // Niños dentro del total de asistentes (0 = evento solo adultos).
  // people_count sigue siendo el TOTAL: adultos = people_count - niños.
  @IsNumber()
  @IsOptional()
  @Min(0)
  children_count?: number;

  // Propina opcional sobre los servicios variables, DESPUÉS del IVA
  // (no lleva IVA, va directa al equipo). null = sin propina.
  @IsNumber()
  @IsOptional()
  @Min(0)
  tip_percentage?: number | null;

  // Monto de la propina en pesos (migración 37). El porcentaje es la
  // regla con la que se llegó al número; esto es el hecho, y queda fijo.
  // Lo calcula quien cotiza (es el mismo monto que ya viene sumado dentro
  // de total_amount), por eso viaja en vez de recalcularse aquí.
  @IsNumber()
  @IsOptional()
  @Min(0)
  tip_amount?: number | null;

  // Persona de contacto del evento (texto libre; puente a la Etapa 4).
  @IsString()
  @IsOptional()
  contact_name?: string | null;

  @IsString()
  @IsOptional()
  observations: string;

  @IsNumber()
  @IsOptional()
  @Min(0, { message: 'Total amount must be non-negative' })
  total_amount?: number;

  @IsEnum(QuotationStatus)
  @IsNotEmpty()
  quotation_status: QuotationStatus;

  @IsNumber()
  @IsOptional()
  @Min(0, { message: 'Value per person must be non-negative' })
  value_per_person?: number;

  @IsNumber()
  @IsOptional()
  @Min(0, { message: 'Fixed value must be non-negative' })
  fixed_value?: number;

  @IsEnum(RequestType)
  @IsNotEmpty()
  request_type: RequestType;

  @IsBoolean()
  @IsOptional()
  requires_invoice?: boolean;

  @IsBoolean()
  @IsOptional()
  has_contract?: boolean;

  @IsEnum(PaymentPlanType)
  @IsOptional()
  payment_plan_type?: PaymentPlanType;

  @IsNumber()
  @IsOptional()
  @Min(0, { message: 'Discount percentage must be non-negative' })
  discount_percentage?: number;

  @IsNumber()
  @IsOptional()
  @Min(0, { message: 'Discount amount must be non-negative' })
  discount_amount?: number;

  @IsNumber()
  @IsOptional()
  @Min(0, { message: 'Subtotal amount must be non-negative' })
  subtotal_amount?: number;

  @IsObject()
  @IsOptional()
  items?: QuotationItem;
}
