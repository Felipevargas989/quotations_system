import { Type } from 'class-transformer';
import {
  IsArray,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/** Un brochure ya subido al storage (kind 'consulta-brochure'). */
export class BrochureDto {
  @IsString()
  @MaxLength(200)
  nombre!: string;

  @IsString()
  @MaxLength(500)
  path!: string;

  @IsInt()
  @Min(0)
  bytes!: number;
}

/** La configuración del embudo para un tipo de evento: el texto del
 *  correo (null = el de la casa) y hasta 2 brochures. */
export class GuardarConfigDto {
  @IsOptional()
  @IsString()
  @MaxLength(4000)
  texto?: string | null;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BrochureDto)
  brochures?: BrochureDto[];
}
