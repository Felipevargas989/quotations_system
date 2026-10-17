import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export const ESTADOS_OPORTUNIDAD = [
  'nueva',
  'en_estudio',
  'postulada',
  'ganada',
  'perdida',
  'descartada',
] as const;
export type EstadoOportunidad = (typeof ESTADOS_OPORTUNIDAD)[number];

export class ListarOportunidadesDto {
  /** Solo lo que sigue abierto (cierre futuro o sin cierre). Si no viene,
   *  sí: la bandeja es de lo vigente; lo cerrado es historial. */
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true' || value === '1')
  @IsBoolean()
  vigentes?: boolean;

  @IsOptional()
  @IsIn(['verde', 'amarillo', 'rojo'])
  semaforo?: 'verde' | 'amarillo' | 'rojo';

  @IsOptional()
  @IsIn(ESTADOS_OPORTUNIDAD)
  estado?: EstadoOportunidad;

  @IsOptional()
  @IsIn(['licitacion', 'compra_agil'])
  tipo?: 'licitacion' | 'compra_agil';

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5000)
  limite?: number;
}
