import { IsBoolean, IsInt, IsOptional, IsString } from 'class-validator';

// Rename a category and/or change its active state or order.
export class UpdateCategoryDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;

  @IsInt()
  @IsOptional()
  sort_order?: number;
}
