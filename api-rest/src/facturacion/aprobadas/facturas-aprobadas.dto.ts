import { Type } from 'class-transformer';
import { IsInt, IsOptional, ValidateNested } from 'class-validator';
import { DtePedidoDto } from '../facturas/factura.dto';

/** Lo que se aprueba (doc 19 §9.48): el documento completo y, si el evento
 *  va en una factura por OC, de cuál OC es. */
export class AprobarFacturaDto {
  @IsOptional()
  @IsInt()
  oc_id?: number | null;

  @ValidateNested()
  @Type(() => DtePedidoDto)
  pedida: DtePedidoDto;
}
