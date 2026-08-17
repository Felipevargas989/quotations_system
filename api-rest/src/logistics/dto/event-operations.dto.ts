import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  ValidateNested,
} from 'class-validator';

// Mudanza #6 "una sola puerta" (28-07): COMPRAS, provisiones, recursos
// de evento, ficha de cocina, recetas y costos fijos — el resto de
// logística. company_id NUNCA viaja: sale de la sesión.

export class ProvisionedServiceDto {
  @IsString()
  @IsNotEmpty()
  nombre: string;

  @IsNumber()
  quantity: number;
}

export class MarkProvisionedEntryDto {
  @IsUUID()
  id: string;

  @IsNumber()
  cost: number;

  @IsNumber()
  people: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProvisionedServiceDto)
  services: ProvisionedServiceDto[];
}

export class MarkProvisionedDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MarkProvisionedEntryDto)
  entries: MarkProvisionedEntryDto[];
}

export class ClearProvisionedDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  ids: string[];
}

export class SupplyProvisionRowDto {
  @IsUUID()
  quotation_id: string;

  @IsInt()
  supply_id: number;

  @IsNumber()
  qty_base: number;

  @IsNumber()
  cost: number;

  @IsOptional()
  @IsInt()
  supplier_id?: number | null;

  @IsOptional()
  @IsString()
  supplier_name?: string | null;
}

export class UpsertSupplyProvisionsDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SupplyProvisionRowDto)
  rows: SupplyProvisionRowDto[];
}

export class DeleteSupplyProvisionsDto {
  @IsArray()
  @IsUUID(undefined, { each: true })
  quotationIds: string[];

  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  supplyIds?: number[];
}

export class EventResourceRowDto {
  @IsUUID()
  quotation_id: string;

  @IsInt()
  resource_id: number;

  @IsNumber()
  quantity: number;

  @IsNumber()
  price_fixed: number;

  @IsNumber()
  price_per_person: number;

  @IsOptional()
  @IsInt()
  origin_fixed_service_id?: number | null;

  // El día del evento al que corresponde esta cantidad. NULL = sin
  // repartir. La cantidad de una línea SIEMPRE fue el total del evento;
  // repartirla no cambia el costo, solo dice cuándo va cada uno.
  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'El día va como 2026-08-14' })
  day?: string | null;
}

export class AddEventResourcesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => EventResourceRowDto)
  rows: EventResourceRowDto[];
}

export class UpdateEventResourceDto {
  @IsOptional()
  @IsNumber()
  quantity?: number;

  @IsOptional()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'El día va como 2026-08-14' })
  day?: string | null;

  @IsOptional()
  @IsNumber()
  price_fixed?: number;

  @IsOptional()
  @IsNumber()
  price_per_person?: number;
}

export class SetServiceTimeDto {
  @IsUUID()
  quotation_id: string;

  @IsString()
  @IsNotEmpty()
  service_name: string;

  @IsString()
  @IsNotEmpty()
  start_time: string;
}

export class AddKitchenNoteDto {
  @IsUUID()
  quotation_id: string;

  @IsString()
  @IsNotEmpty()
  note: string;

  @IsOptional()
  @IsInt()
  day?: number;
}

export class MarkDaysPrintedDto {
  @IsUUID()
  quotation_id: string;

  @IsArray()
  @IsInt({ each: true })
  days: number[];
}

export class AddRecipeItemDto {
  @IsIn(['variable', 'fixed'])
  service_type: string;

  @IsInt()
  service_id: number;

  @IsIn(['insumo', 'mobiliario'])
  item_kind: string;

  @IsOptional()
  @IsInt()
  supply_id?: number | null;

  @IsOptional()
  @IsInt()
  furniture_id?: number | null;

  @IsNumber()
  qty_per_person: number;

  @IsString()
  @IsNotEmpty()
  unit: string;
}

export class UpdateRecipeItemDto {
  @IsOptional()
  @IsNumber()
  qty_per_person?: number;

  @IsOptional()
  @IsString()
  unit?: string;
}

export class UpdateFixedCostsDto {
  @IsNumber()
  cost_fixed: number;

  @IsNumber()
  cost_per_person: number;
}

export class AddCostItemDto {
  @IsInt()
  fixed_service_id: number;

  @IsInt()
  resource_id: number;

  @IsNumber()
  quantity: number;
}

export class UpdateCostItemDto {
  @IsNumber()
  quantity: number;
}
