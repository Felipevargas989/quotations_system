import { IsInt, IsOptional, Matches, Max, Min } from 'class-validator';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Llevar la propuesta técnica a la cotización (decisión 29). Con
 *  `numero` se vincula y se reescribe esa cotización; sin él, la ya
 *  vinculada, o se crea una. */
export class LlevarACotizacionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000_000)
  numero?: number;

  /** El precio de «Armar postulación», con IVA (decisión 35): la
   *  cotización queda con ese total. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000_000_000)
  total?: number;

  /** Las fechas elegidas al crear (decisión 69), AAAA-MM-DD: desde y,
   *  si dura más de un día, hasta. */
  @IsOptional()
  @Matches(ISO, { message: 'La fecha de inicio va como AAAA-MM-DD.' })
  desde?: string;

  @IsOptional()
  @Matches(ISO, { message: 'La fecha de término va como AAAA-MM-DD.' })
  hasta?: string;
}

/** «Armar postulación» (decisión 35): el precio total, con IVA, en pesos.
 *  Es lo único que pide. */
export class ArmarPostulacionDto {
  @IsInt()
  @Min(1)
  @Max(100_000_000_000)
  total!: number;
}
