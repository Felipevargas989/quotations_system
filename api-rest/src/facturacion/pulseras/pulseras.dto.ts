import { IsInt, Max, Min } from 'class-validator';

/** «Entregar pulseras» (doc 19 §9.49): cuántas se le pasan a recepción.
 *  Quién y cuándo salen de la sesión. */
export class EntregarPulserasDto {
  @IsInt({ message: 'Va en pulseras enteras' })
  @Min(1, { message: 'Tiene que ser al menos una pulsera' })
  @Max(100000, { message: 'Son demasiadas de una vez' })
  cantidad: number;
}
