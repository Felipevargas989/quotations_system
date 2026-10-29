import { IsIn } from 'class-validator';
import { MOTIVOS_DEL_DESCARTE, type MotivoDelDescarte } from '../decisiones';

/** El porqué de un descarte (decisión 113). */
export class MotivoDelDescarteDto {
  @IsIn(MOTIVOS_DEL_DESCARTE)
  motivo!: MotivoDelDescarte;
}
