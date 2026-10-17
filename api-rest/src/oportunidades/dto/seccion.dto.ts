import { IsIn, IsOptional } from 'class-validator';

/** De qué lado de la ficha es un archivo (migración 127): 'bases', lo que
 *  publicó el comprador en Mercado Público (el de siempre); 'postulacion',
 *  lo que la empresa va a presentar. Sin decirlo, 'bases'. */
export class SeccionDto {
  @IsOptional()
  @IsIn(['bases', 'postulacion'])
  seccion?: 'bases' | 'postulacion';
}
