import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

// Secciones de servicios fijos (migración 53).

export class CreateFixedSectionDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name: string;
}

export class UpdateFixedSectionDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}

export class ReorderFixedSectionsDto {
  @IsArray()
  @IsInt({ each: true })
  section_ids: number[];
}

export class ReorderFixedServicesDto {
  // null = la caja "Sin sección".
  @IsOptional()
  @IsInt()
  section_id?: number | null;

  @IsArray()
  @IsInt({ each: true })
  service_ids: number[];
}
