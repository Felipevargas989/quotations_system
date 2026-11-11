import {
  Body,
  Controller,
  Delete,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Put,
  Query,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Permiso } from 'src/auth/permiso.decorator';
import { OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import type { DtePedido } from '../facturas/borrador';
import { AprobarFacturaDto } from './facturas-aprobadas.dto';
import { FacturasAprobadasService } from './facturas-aprobadas.service';

// LA FACTURA APROBADA DE UN EVENTO (doc 19 §9.48): guardarla al aprobar y
// quitarla al corregir. Es de «Facturar eventos» (`facturacion_eventos`:
// operaciones y el administrador, de fábrica), como emitirla. La lista
// llega con «Por facturar». Solo con el módulo propio `facturacion`, y la
// empresa sale SIEMPRE de la sesión.
@Derecho('facturacion')
@Controller('quotations/:quotationId/facturas/aprobada')
export class FacturasAprobadasController {
  constructor(
    private readonly aprobadas: FacturasAprobadasService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FacturasAprobadasController.name);
  }

  @Roles(...OPERATIONS_AND_UP)
  @Permiso('facturacion_eventos')
  @Put()
  aprobar(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() dto: AprobarFacturaDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`PUT /quotations/${quotationId}/facturas/aprobada`);
    return this.aprobadas.aprobar(
      quotationId,
      user,
      dto.oc_id ?? null,
      dto.pedida as DtePedido,
    );
  }

  @Roles(...OPERATIONS_AND_UP)
  @Permiso('facturacion_eventos')
  @Delete()
  quitar(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Query('oc', new ParseIntPipe({ optional: true })) oc: number | undefined,
    @CurrentUser() user: User,
  ) {
    return this.aprobadas.quitar(quotationId, user, oc ?? null);
  }
}
