import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  Min,
} from 'class-validator';

/** La prueba de la lectura corta (decisión 132): qué oportunidades leer.
 *  Hasta 200 por lote. */
export class PruebaDeLecturaCortaDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsInt({ each: true })
  @Min(1, { each: true })
  ids!: number[];

  /** Haiku de partida; Sonnet para los casos difíciles. */
  @IsOptional()
  @IsIn(['haiku', 'sonnet'])
  modelo?: 'haiku' | 'sonnet';
}
