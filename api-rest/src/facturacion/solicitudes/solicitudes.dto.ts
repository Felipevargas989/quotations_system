import { IsOptional, IsString, MaxLength } from 'class-validator';

/** «Rechazar» una solicitud de recepción (doc 19 §9.45): el motivo, si se
 *  quiere dejar (hasta 300, como la base). */
export class RechazarSolicitudDto {
  @IsOptional()
  @IsString()
  @MaxLength(300, { message: 'El motivo cabe en 300 caracteres' })
  motivo?: string | null;
}
