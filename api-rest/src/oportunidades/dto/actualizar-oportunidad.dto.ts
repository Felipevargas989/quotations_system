import { IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import {
  MOTIVOS_DEL_DESCARTE,
  type MotivoDelDescarte,
} from '../decisiones/decisiones';
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

  /** El porqué de un descarte (decisión 113): solo vale con estado
   *  «descartada»; se anota en el registro de decisiones. */
  @IsOptional()
  @IsIn(MOTIVOS_DEL_DESCARTE)
  motivo?: MotivoDelDescarte;
}
