import {
  IsArray,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
} from 'class-validator';

// Mudanza #7 (28-07): secciones de categoría (carta) por el backend.
export class CreateSectionDto {
  @IsInt()
  category_id: number;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsNumber()
  sort_order: number;
}

export class RenameSectionDto {
  @IsString()
  @IsNotEmpty()
  name: string;
}

export class ReorderSectionsDto {
  @IsArray()
  @IsInt({ each: true })
  orderedIds: number[];
}

export class SetDefaultSectionDto {
  @IsInt()
  category_id: number;

  @IsOptional()
  @IsInt()
  section_id?: number | null;
}

export class SetLinkSectionDto {
  @IsOptional()
  @IsInt()
  section_id?: number | null;

  @IsNumber()
  sort_order: number;
}
