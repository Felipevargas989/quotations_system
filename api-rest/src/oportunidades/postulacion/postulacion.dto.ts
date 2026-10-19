import { IsInt, IsOptional, Max, Min } from 'class-validator';

/** Llevar la propuesta técnica a la cotización (decisión 29). Con
 *  `numero` se vincula y se reescribe esa cotización; sin él, la ya
 *  vinculada, o se crea una. */
export class LlevarACotizacionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  numero?: number;
}

/** La oferta de la postulación, con IVA, en pesos: la pone la empresa. */
export class FijarOfertaDto {
  @IsInt()
  @Min(1)
  @Max(100_000_000_000)
  total!: number;
}
