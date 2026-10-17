import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { MAX_DOCUMENTOS } from '../generacion/generacion.service';

/** "Generar anexos" (doc 17, sprint 3, paso 4). */
export class GenerarAnexosDto {
  /** El total de la oferta, con IVA, en pesos: lo pone la empresa, nunca la
   *  IA. Sin él, la oferta económica queda en blanco. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100_000_000_000)
  monto_total?: number;

  /** Qué Word de «Bases y anexos» llenar; sin decirlo, todos. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(MAX_DOCUMENTOS)
  @IsInt({ each: true })
  adjuntos?: number[];
}

/** "Firmar": los Word de «Mi postulación» que la empresa ya revisó. */
export class FirmarDocumentosDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_DOCUMENTOS)
  @IsInt({ each: true })
  adjuntos!: number[];
}
