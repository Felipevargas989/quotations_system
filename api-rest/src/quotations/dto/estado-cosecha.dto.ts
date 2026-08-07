import { IsIn, IsOptional, IsString } from 'class-validator';

// Los cinco estados de la cosecha del mes (migración 63).
//
// OJO: esta lista tiene una gemela en el frontend
// (frontend/src/pages/dashboard/tendencias.ts → ESTADOS_COSECHA) y no
// hay nada que las obligue a coincidir: el repo no tiene paquete
// compartido, las dos apps solo hablan por HTTP. Agregar un estado allá
// sin agregarlo acá se ve como un chip que vuelve solo, sin explicación.
// Se tocan las dos o ninguna.
// Dos los
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
