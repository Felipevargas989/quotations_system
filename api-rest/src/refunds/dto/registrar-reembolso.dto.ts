import { IsNotEmpty, IsString } from 'class-validator';
import { RegisterRefundDto } from './register-refund.dto';

// REEMBOLSOS POR PARTES (20-10-2026): «Registrar reembolso» de la ficha. Va
// contra lo que falta por devolver de la cotización, no contra una fila.
export class RegistrarReembolsoDto extends RegisterRefundDto {
  @IsString()
  @IsNotEmpty()
  quotation_id: string;
}
