import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, Max, Min } from 'class-validator';

export class ListarOportunidadesDto {
  @IsOptional()
  @IsIn(['verde', 'amarillo', 'rojo'])
  semaforo?: 'verde' | 'amarillo' | 'rojo';

  @IsOptional()
  @IsIn(['nueva', 'en_estudio', 'postulada', 'ganada', 'perdida', 'descartada'])
  estado?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  limite?: number;
}
