import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import {
  CrearOrdenDeCompraDto,
  EditarOrdenDeCompraDto,
} from './orden-de-compra.dto';
import { OrdenesDeCompraService } from './ordenes-de-compra.service';

// Las órdenes de compra de un evento (migración 184, doc 19, paso 2a). Es
// la pestaña «Facturación» de Post-Venta: la ven y la escriben operaciones
// y el administrador, y solo en la empresa con el módulo propio
// `facturacion`. La empresa sale SIEMPRE de la sesión.
@Derecho('facturacion')
@Controller('quotations/:quotationId/ordenes-de-compra')
export class OrdenesDeCompraController {
  constructor(
    private readonly ordenes: OrdenesDeCompraService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OrdenesDeCompraController.name);
  }

  @Roles(...OPERATIONS_AND_UP)
  @Get()
  deCotizacion(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @CurrentUser() user: User,
  ) {
    return this.ordenes.deCotizacion(quotationId, user.company_id);
  }

  @Roles(...OPERATIONS_AND_UP)
  @Post()
  crear(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Body() dto: CrearOrdenDeCompraDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /quotations/${quotationId}/ordenes-de-compra`);
    return this.ordenes.crear(
      quotationId,
      user.company_id,
      dto,
      user.id ?? null,
    );
  }

  @Roles(...OPERATIONS_AND_UP)
  @Patch(':id')
  editar(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarOrdenDeCompraDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `PATCH /quotations/${quotationId}/ordenes-de-compra/${id}`,
    );
    return this.ordenes.editar(quotationId, user.company_id, id, dto);
  }

  @Roles(...OPERATIONS_AND_UP)
  @Delete(':id')
  borrar(
    @Param('quotationId', ParseUUIDPipe) quotationId: string,
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    this.logger.info(
      `DELETE /quotations/${quotationId}/ordenes-de-compra/${id}`,
    );
    return this.ordenes.borrar(quotationId, user.company_id, id);
  }
}
