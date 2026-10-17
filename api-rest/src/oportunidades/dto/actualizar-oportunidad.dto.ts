import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  ESTADOS_OPORTUNIDAD,
  type EstadoOportunidad,
} from './listar-oportunidades.dto';

/** Lo que la empresa decide sobre una oportunidad. La lectura de la IA no
 *  se edita: es la foto de lo que leyó. `null` borra el responsable o las
 *  notas. */
export class ActualizarOportunidadDto {
  @IsOptional()
  @IsIn(ESTADOS_OPORTUNIDAD)
  estado?: EstadoOportunidad;

  @IsOptional()
  @IsUUID()
  responsable_id?: string | null;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  notas?: string | null;
}
