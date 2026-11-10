import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Permiso } from 'src/auth/permiso.decorator';
import { OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { BoletaSueltaDto } from '../boletas/boleta.dto';
import { DEL_TARIFARIO } from '../cargos-del-tarifario';
import type { DtePedido } from '../facturas/borrador';
import { DtePedidoDto } from '../facturas/factura.dto';
import { RechazarSolicitudDto } from './solicitudes.dto';
import { SolicitudesService } from './solicitudes.service';

// LAS SOLICITUDES DE RECEPCIÓN (doc 19 §9.45). Mandarlas es de «Boletas y
// facturas del tarifario» (`boletas`), y el servicio deja solo al cargo
// recepción (los demás emiten directo). Verlas, aprobarlas y emitirlas o
// rechazarlas es de «Aprobar y emitir solicitudes»
// (`facturacion_solicitudes`; de fábrica, operaciones y el administrador).
// El `@Roles` de cada puerta es lo de fábrica del catálogo, como exige la
// prueba de fábrica. Solo con el módulo propio `facturacion`, y la empresa
// sale SIEMPRE de la sesión.
@Derecho('facturacion')
@Controller('facturacion/solicitudes')
export class SolicitudesController {
  constructor(
    private readonly solicitudes: SolicitudesService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SolicitudesController.name);
  }

  @Permiso('boletas')
  @Post('boleta')
  @Roles(...DEL_TARIFARIO)
  boleta(@Body() dto: BoletaSueltaDto, @CurrentUser() user: User) {
    this.logger.info('POST /facturacion/solicitudes/boleta');
    return this.solicitudes.solicitarBoleta(user, dto);
  }

  @Permiso('boletas')
  @Post('factura')
  @Roles(...DEL_TARIFARIO)
  factura(@Body() dto: DtePedidoDto, @CurrentUser() user: User) {
    this.logger.info('POST /facturacion/solicitudes/factura');
    return this.solicitudes.solicitarFactura(user, dto as DtePedido);
  }

  /** Las del turno abierto: recepción ve cómo van las suyas. */
  @Permiso('boletas')
  @Get('del-turno')
  @Roles(...DEL_TARIFARIO)
  delTurno(@CurrentUser() user: User) {
    return this.solicitudes.delTurno(user);
  }

  @Permiso('facturacion_solicitudes')
  @Get()
  @Roles(...OPERATIONS_AND_UP)
  lista(@CurrentUser() user: User) {
    return this.solicitudes.lista(user);
  }

  @Permiso('facturacion_solicitudes')
  @Post(':id/aprobar')
  @Roles(...OPERATIONS_AND_UP)
  aprobar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    this.logger.info(`POST /facturacion/solicitudes/${id}/aprobar`);
    return this.solicitudes.aprobar(user, id);
  }

  @Permiso('facturacion_solicitudes')
  @Post(':id/rechazar')
  @Roles(...OPERATIONS_AND_UP)
  rechazar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RechazarSolicitudDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /facturacion/solicitudes/${id}/rechazar`);
    return this.solicitudes.rechazar(user, id, dto);
  }
}
