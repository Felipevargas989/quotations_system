import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

// New order of the categories themselves.
export class ReorderCategoriesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  category_ids: number[];
}
