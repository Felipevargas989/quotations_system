import { ArrayNotEmpty, IsArray, IsInt } from 'class-validator';

export class ReorderClientTypesDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsInt({ each: true })
  ids: number[];
}
