import { IsIn, IsOptional, IsString } from 'class-validator';

// Los cinco estados de la cosecha del mes (migración 63). Dos los
// sugiere la máquina con el cruce empresa+mandante+tipo de evento; los
// otros tres solo los sabe quien vende. `null` borra la corrección y
// devuelve el mando a la sugerencia.
export const ESTADOS_COSECHA = [
  'revendido',
  'en_gestion',
  'no_ha_vuelto',
  'no_se_repite',
  'descartado',
] as const;

export class EstadoCosechaDto {
  @IsOptional()
  @IsString()
  @IsIn([...ESTADOS_COSECHA])
  estado?: string | null;
}
