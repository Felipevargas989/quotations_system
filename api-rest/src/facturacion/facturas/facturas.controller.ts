import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Permiso } from 'src/auth/permiso.decorator';
import { OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import type { DtePedido } from './borrador';
import { BorradorDelDteDto, DtePedidoDto } from './factura.dto';
import { FacturasService } from './facturas.service';

// El DTE del evento (doc 19 §9.2 y §9.20): la factura o la boleta. Desde el
// 07-11 se emite solo en Facturación → «Por facturar» (§9.23; la pestaña de
// Post-Venta salió), y todo, también emitir, es de «Facturar eventos»
// (`facturacion_eventos`: operaciones y el administrador, de fábrica; antes
// emitía solo el administrador, D5). Felipe: *"los de operación y
// administrador pueden facturar los eventos que falten facturar"*. Solo en
// la empresa con el módulo propio `facturacion`, y la empresa sale SIEMPRE
// de la sesión.
@Derecho('facturacion')
@Controller('quotations/:quotationId/facturas')
export class FacturasController {
  constructor(
    private readonly facturas: FacturasService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FacturasController.name);
  }

  @Roles(...OPERATIONS_AND_UP)
  @Permiso('facturacion_eventos')
  @Get()
  documentos(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @CurrentUser() user: User,
  ) {
    return this.facturas.documentos(quotationId, user.company_id);
  }

  @Roles(...OPERATIONS_AND_UP)
  @Permiso('facturacion_eventos')
  @Post('preparar')
  preparar(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /quotations/${quotationId}/facturas/preparar`);
    return this.facturas.preparar(quotationId, user);
  }

  @Roles(...OPERATIONS_AND_UP)
  @Permiso('facturacion_eventos')
  @Post('borrador')
  borrador(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() dto: BorradorDelDteDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /quotations/${quotationId}/facturas/borrador`);
    return this.facturas.borrador(
      quotationId,
      user.company_id,
      dto.tipo,
      dto.orden_de_compra_id ?? null,
      dto.porcentaje ?? null,
    );
  }

  @Roles(...OPERATIONS_AND_UP)
  @Permiso('facturacion_eventos')
  @Post('revisar')
  revisar(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() dto: DtePedidoDto,
    @CurrentUser() user: User,
  ) {
    return this.facturas.revisar(
      quotationId,
      user.company_id,
      dto as DtePedido,
    );
  }

  @Roles(...OPERATIONS_AND_UP)
  @Permiso('facturacion_eventos')
  @Post('emitir')
  emitir(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() dto: DtePedidoDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /quotations/${quotationId}/facturas/emitir`);
    return this.facturas.emitir(quotationId, user, dto as DtePedido);
  }
}
