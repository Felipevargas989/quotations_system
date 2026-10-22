import { IsString, MaxLength } from 'class-validator';

/** Lo que confirmó el comprador sobre una respuesta de «Pregúntale a la
 *  IA» (decisión 68). Vacío lo borra. */
export class ConfirmarPreguntaDto {
  @IsString()
  @MaxLength(600)
  confirmado!: string;
}
