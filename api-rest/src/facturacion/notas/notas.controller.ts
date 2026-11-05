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
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { MesDto, NotaPedidaDto } from './nota.dto';
import { NotasService } from './notas.service';

// La lista de Facturación y las notas (doc 19 §9.5, paso 4): todo lo
// emitido, la cadena de anulaciones, «Comprobar» y las notas de crédito y
// de débito. Solo el administrador (E5), solo con el módulo propio
// `facturacion`, y la empresa sale SIEMPRE de la sesión.
@Derecho('facturacion')
@Roles(...ADMIN_ONLY)
@Controller('facturacion')
export class NotasController {
  constructor(
    private readonly notas: NotasService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(NotasController.name);
  }

  @Get('documentos')
  lista(@Query() q: MesDto, @CurrentUser() user: User) {
    return this.notas.lista(user.company_id, q.mes);
  }

  /** «Probar la conexión» con facturacion.cl (paso 0): no emite nada. */
  @Get('conexion')
  conexion(@CurrentUser() user: User) {
    this.logger.info('GET /facturacion/conexion');
    return this.notas.conexionConFacturacionCl(user.company_id);
  }

  @Post('documentos/:id/comprobar')
  comprobar(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    this.logger.info(`POST /facturacion/documentos/${id}/comprobar`);
    return this.notas.comprobar(user, id);
  }

  @Post('documentos/:id/pdf')
  pedirPdf(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.notas.pedirPdf(user, id);
  }

  @Post('documentos/:id/notas/revisar')
  revisarNota(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NotaPedidaDto,
    @CurrentUser() user: User,
  ) {
    return this.notas.revisarNota(user, id, dto);
  }

  @Post('documentos/:id/notas/emitir')
  emitirNota(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NotaPedidaDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /facturacion/documentos/${id}/notas/emitir`);
    return this.notas.emitirNota(user, id, dto);
  }
}
