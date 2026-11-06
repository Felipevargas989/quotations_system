import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { DentroDe, Permiso } from 'src/auth/permiso.decorator';
import { ADMIN_ONLY, OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import type { DtePedido } from './borrador';
import { DtePedidoDto, RutDto } from './factura.dto';
import { FacturasService } from './facturas.service';

// La factura de «Nuevo documento» de la sección Facturación (doc 19
// §9.21): de cero, sin evento ni OC. La razón social se busca por su RUT
// entre las de los clientes; la vista previa la ven los que ven
// «Documentos» (`facturacion_documentos`), y emitir es solo del
// administrador (D5). Solo con el módulo propio `facturacion`, y la
// empresa sale SIEMPRE de la sesión.
@Derecho('facturacion')
@Controller('facturacion')
export class FacturaSinEventoController {
  constructor(
    private readonly facturas: FacturasService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FacturaSinEventoController.name);
  }

  @Permiso('facturacion_documentos')
  @Get('razon-social')
  @Roles(...OPERATIONS_AND_UP)
  razonSocial(@Query() q: RutDto, @CurrentUser() user: User) {
    return this.facturas.razonSocialPorRut(user.company_id, q.rut);
  }

  @Permiso('facturacion_documentos')
  @Post('facturas/revisar')
  @Roles(...OPERATIONS_AND_UP)
  revisar(@Body() dto: DtePedidoDto, @CurrentUser() user: User) {
    return this.facturas.revisarSinEvento(user.company_id, dto as DtePedido);
  }

  // Emitir es del administrador (D5), dentro de «Documentos»: como la
  // factura del evento, que va dentro de Post-Venta.
  @DentroDe('facturacion_documentos')
  @Post('facturas/emitir')
  @Roles(...ADMIN_ONLY)
  emitir(@Body() dto: DtePedidoDto, @CurrentUser() user: User) {
    this.logger.info('POST /facturacion/facturas/emitir');
    return this.facturas.emitirSinEvento(user, dto as DtePedido);
  }
}
