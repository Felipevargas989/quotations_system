import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Permiso } from 'src/auth/permiso.decorator';
import { ADMIN_ONLY, OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { ListaDto, NotaPedidaDto } from './nota.dto';
import { NotasService } from './notas.service';

// La lista de Facturación y las notas (doc 19 §9.5, paso 4): todo lo
// emitido, la cadena de anulaciones, «Comprobar» y las notas de crédito y
// de débito. Solo con el módulo propio `facturacion`, y la empresa sale
// SIEMPRE de la sesión. Desde el 05-11 (§9.19, una sola sección), la lista
// y «Pedir el PDF» son de operaciones y arriba (Felipe: «ver, reporte y
// PDF»); anular, «Comprobar» y «Probar la conexión», solo del
// administrador (E5).
@Derecho('facturacion')
@Controller('facturacion')
export class NotasController {
  constructor(
    private readonly notas: NotasService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(NotasController.name);
  }

  @Permiso('facturacion_documentos')
  @Get('documentos')
  @Roles(...OPERATIONS_AND_UP)
  lista(@Query() q: ListaDto, @CurrentUser() user: User) {
    // Un rango de fechas (§9.22, sprint 2) o, como antes, un mes.
    const periodo =
      q.desde || q.hasta ? { desde: q.desde, hasta: q.hasta } : q.mes;
    return this.notas.lista(
      user.company_id,
      periodo,
      user.role,
      user.permisos,
      q.tipos?.split(',').map(Number),
    );
  }

  /** «Probar la conexión» con facturacion.cl (paso 0): no emite nada. */
  @Permiso('facturacion_ajustes')
  @Get('conexion')
  @Roles(...ADMIN_ONLY)
  conexion(@CurrentUser() user: User) {
    this.logger.info('GET /facturacion/conexion');
    return this.notas.conexionConFacturacionCl(user.company_id);
  }

  @Permiso('facturacion_ajustes')
  @Post('documentos/:id/comprobar')
  @Roles(...ADMIN_ONLY)
  comprobar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    this.logger.info(`POST /facturacion/documentos/${id}/comprobar`);
    return this.notas.comprobar(user, id);
  }

  @Permiso('facturacion_documentos')
  @Post('documentos/:id/pdf')
  @Roles(...OPERATIONS_AND_UP)
  pedirPdf(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.notas.pedirPdf(user, id);
  }

  @Permiso('facturacion_notas')
  @Post('documentos/:id/notas/revisar')
  @Roles(...ADMIN_ONLY)
  revisarNota(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NotaPedidaDto,
    @CurrentUser() user: User,
  ) {
    return this.notas.revisarNota(user, id, dto);
  }

  @Permiso('facturacion_notas')
  @Post('documentos/:id/notas/emitir')
  @Roles(...ADMIN_ONLY)
  emitirNota(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NotaPedidaDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /facturacion/documentos/${id}/notas/emitir`);
    return this.notas.emitirNota(user, id, dto);
  }
}
