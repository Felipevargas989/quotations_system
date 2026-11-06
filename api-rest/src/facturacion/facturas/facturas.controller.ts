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
import { ADMIN_ONLY, OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import type { DtePedido } from './borrador';
import { BaseDelDteDto, DtePedidoDto } from './factura.dto';
import { FacturasService } from './facturas.service';

// El DTE del evento (doc 19 §9.2 y §9.20): la factura o la boleta, en la
// pestaña «Facturación» de Post-Venta. Preparar (BelIA lee las OC de
// Documentos), el borrador y la vista previa los ven operaciones y el
// administrador; emitir es solo del administrador (D5). Solo en la empresa
// con el módulo propio `facturacion`, y la empresa sale SIEMPRE de la
// sesión.
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
  @Get()
  documentos(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @CurrentUser() user: User,
  ) {
    return this.facturas.documentos(quotationId, user.company_id);
  }

  @Roles(...OPERATIONS_AND_UP)
  @Post('preparar')
  preparar(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /quotations/${quotationId}/facturas/preparar`);
    return this.facturas.preparar(quotationId, user);
  }

  @Roles(...OPERATIONS_AND_UP)
  @Post('borrador')
  borrador(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() dto: BaseDelDteDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /quotations/${quotationId}/facturas/borrador`);
    return this.facturas.borrador(
      quotationId,
      user.company_id,
      dto.tipo,
      dto.orden_de_compra_id ?? null,
    );
  }

  @Roles(...OPERATIONS_AND_UP)
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

  @Roles(...ADMIN_ONLY)
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
