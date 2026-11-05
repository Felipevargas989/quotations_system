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
import { DentroDe, Permiso } from 'src/auth/permiso.decorator';
import { ADMIN_ONLY, OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { BaseDeLaFacturaDto, FacturaPedidaDto } from './factura.dto';
import { FacturasService } from './facturas.service';

// La factura del evento (doc 19, paso 2c), en la pestaña «Facturación» de
// Post-Venta. El borrador y la vista previa los ven operaciones y el
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
  @Permiso('postventa')
  @Get()
  documentos(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @CurrentUser() user: User,
  ) {
    return this.facturas.documentos(quotationId, user.company_id);
  }

  @Roles(...OPERATIONS_AND_UP)
  @Permiso('postventa')
  @Post('borrador')
  borrador(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() dto: BaseDeLaFacturaDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /quotations/${quotationId}/facturas/borrador`);
    return this.facturas.borrador(
      quotationId,
      user.company_id,
      dto.orden_de_compra_id ?? null,
    );
  }

  @Roles(...OPERATIONS_AND_UP)
  @Permiso('postventa')
  @Post('revisar')
  revisar(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() dto: FacturaPedidaDto,
    @CurrentUser() user: User,
  ) {
    return this.facturas.revisar(quotationId, user.company_id, {
      ...dto,
      orden_de_compra_id: dto.orden_de_compra_id ?? null,
      porcentaje: dto.porcentaje ?? null,
      monto: dto.monto ?? null,
      detalle: {
        ...dto.detalle,
        descripcion_larga: dto.detalle.descripcion_larga ?? null,
      },
    });
  }

  @Roles(...ADMIN_ONLY)
  @DentroDe('postventa')
  @Post('emitir')
  emitir(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() dto: FacturaPedidaDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /quotations/${quotationId}/facturas/emitir`);
    return this.facturas.emitir(quotationId, user, {
      ...dto,
      orden_de_compra_id: dto.orden_de_compra_id ?? null,
      porcentaje: dto.porcentaje ?? null,
      monto: dto.monto ?? null,
      detalle: {
        ...dto.detalle,
        descripcion_larga: dto.detalle.descripcion_larga ?? null,
      },
    });
  }
}
