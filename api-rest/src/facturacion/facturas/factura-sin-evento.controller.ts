import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Permiso } from 'src/auth/permiso.decorator';
import { Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { DEL_TARIFARIO } from '../cargos-del-tarifario';
import type { DtePedido } from './borrador';
import { DtePedidoDto, RutDto } from './factura.dto';
import { FacturasService } from './facturas.service';

// La factura de «Nuevo documento» de la sección Facturación (doc 19
// §9.21): de cero, sin evento ni OC. La razón social se busca por su RUT
// entre las de los clientes. Desde el 07-11 (§9.23) la emiten los que
// tienen «Boletas y facturas del tarifario» (`boletas`: recepción,
// operaciones y el administrador, de fábrica), con las líneas del
// tarifario; la línea a mano y el descuento siguen del administrador, y eso
// lo cuida el servicio (`del-tarifario.ts`). Solo con el módulo propio
// `facturacion`, y la empresa sale SIEMPRE de la sesión.
@Derecho('facturacion')
@Controller('facturacion')
export class FacturaSinEventoController {
  constructor(
    private readonly facturas: FacturasService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FacturaSinEventoController.name);
  }

  // El RUT que llena todo (doc 19 §9.27): también al facturar un evento.
  @Permiso('boletas', 'facturacion_eventos')
  @Get('razon-social')
  @Roles(...DEL_TARIFARIO)
  razonSocial(@Query() q: RutDto, @CurrentUser() user: User) {
    return this.facturas.razonSocialPorRut(user.company_id, q.rut);
  }

  // El buscador del destinatario (§9.22): los clientes con sus razones
  // sociales y su contacto principal.
  @Permiso('boletas')
  @Get('clientes')
  @Roles(...DEL_TARIFARIO)
  clientes(@CurrentUser() user: User) {
    return this.facturas.clientesParaFacturar(user.company_id);
  }

  @Permiso('boletas')
  @Post('facturas/revisar')
  @Roles(...DEL_TARIFARIO)
  revisar(@Body() dto: DtePedidoDto, @CurrentUser() user: User) {
    return this.facturas.revisarSinEvento(user, dto as DtePedido);
  }

  @Permiso('boletas')
  @Post('facturas/emitir')
  @Roles(...DEL_TARIFARIO)
  emitir(@Body() dto: DtePedidoDto, @CurrentUser() user: User) {
    this.logger.info('POST /facturacion/facturas/emitir');
    return this.facturas.emitirSinEvento(user, dto as DtePedido);
  }
}
