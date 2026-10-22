import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/** De qué lado de la ficha es un archivo (migración 127): 'bases', lo que
 *  publicó el comprador en Mercado Público (el de siempre); 'postulacion',
 *  lo que la empresa va a presentar; 'competencia', la oferta de otro
 *  oferente (migración 153); 'acta', el acta de evaluación (migración 155).
 *  Sin decirlo, 'bases'. */
export class SeccionDto {
  @IsOptional()
  @IsIn(['bases', 'postulacion', 'competencia', 'acta'])
  seccion?: 'bases' | 'postulacion' | 'competencia' | 'acta';
}

/** Al subir: en 'competencia', de qué oferente es la oferta. */
export class SubirAdjuntoDto extends SeccionDto {
  @IsOptional()
  @IsString()
  @MaxLength(200)
  competidor?: string;
}
