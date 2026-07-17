import { ArrayNotEmpty, IsArray, IsInt, IsNotEmpty } from 'class-validator';

// New order of variable services within a single category.
export class ReorderServicesInCategoryDto {
  @IsInt()
  @IsNotEmpty()
  category_id: number;

  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  service_ids: number[];
}
