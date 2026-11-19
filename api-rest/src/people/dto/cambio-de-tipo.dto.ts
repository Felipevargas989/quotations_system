import { IsIn, Matches } from 'class-validator';

/** La ventana «Desde» (doc 10 §12): a qué tipo pasa y desde qué día rige.
 *  Sirve igual para la vista previa (query) y para registrarlo (body). */
export class CambioDeTipoDto {
  @IsIn(['planta', 'freelance'], { message: 'El tipo es planta o freelance' })
  kind: 'planta' | 'freelance';

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha va como 2026-11-01' })
  desde: string;
}

/** Anotar desde cuándo tiene su tipo de hoy quien no tiene historial (doc
 *  10 §12.1): solo la fecha; el tipo lo pone el motor (el de hoy). */
export class OrigenDelTipoDto {
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'La fecha va como 2026-11-01' })
  desde: string;
}
