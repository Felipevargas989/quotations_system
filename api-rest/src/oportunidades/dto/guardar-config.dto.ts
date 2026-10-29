import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

/** La configuración del módulo (doc 17 §5.7). El monto de alto valor y el
 *  correo de avisos NO van aquí: viven en Configuración de empresa. */
export class GuardarConfigOportunidadesDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(16)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  regiones?: string[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(80)
  @IsString({ each: true })
  @MaxLength(60, { each: true })
  comunas_cercanas?: string[];

  @IsOptional()
  @IsString()
  @MaxLength(3000)
  perfil?: string;

  /** Las categorías de ChileCompra del rubro (decisión 111); vacía = la
   *  marca «del rubro» de siempre. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(40)
  @IsString({ each: true })
  @MaxLength(200, { each: true })
  categorias?: string[];
}
