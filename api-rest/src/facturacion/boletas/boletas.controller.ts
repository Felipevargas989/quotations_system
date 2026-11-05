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
  Query,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, RECEPTION_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import {
  CrearCobroDto,
  EditarCobroDto,
  EditarLineaDelCobroDto,
  LineaDelCobroDto,
} from './boleta.dto';
import { BoletasService } from './boletas.service';

// Las boletas de recepción (migración 187, doc 19, paso 3a): la sección
// «Boletas» del menú, de recepción hacia arriba (D5). El administrador deja
// el cobro (desde el evento o suelto) y lo puede borrar si no tiene
// boletas; recepción lo reparte por cabaña y emite. Solo en la empresa con
// el módulo propio `facturacion`, y la empresa sale SIEMPRE de la sesión.
@Derecho('facturacion')
@Controller('boletas')
export class BoletasController {
  constructor(
    private readonly boletas: BoletasService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BoletasController.name);
  }

  @Roles(...RECEPTION_AND_UP)
  @Get('por-boletear')
  porBoletear(
    @Query('quotation_id', new ParseUUIDPipe({ optional: true }))
    quotationId: string | undefined,
    @CurrentUser() user: User,
  ) {
    return this.boletas.porBoletear(user.company_id, quotationId);
  }

  @Roles(...RECEPTION_AND_UP)
  @Get('emitidas-hoy')
  emitidasHoy(@CurrentUser() user: User) {
    return this.boletas.emitidasHoy(user.company_id);
  }

  @Roles(...ADMIN_ONLY)
  @Post('cobros')
  crearCobro(@Body() dto: CrearCobroDto, @CurrentUser() user: User) {
    this.logger.info('POST /boletas/cobros');
    return this.boletas.crearCobro(user, dto);
  }

  @Roles(...RECEPTION_AND_UP)
  @Patch('cobros/:id')
  editarCobro(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarCobroDto,
    @CurrentUser() user: User,
  ) {
    return this.boletas.editarCobro(user, id, dto);
  }

  @Roles(...ADMIN_ONLY)
  @Delete('cobros/:id')
  borrarCobro(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.boletas.borrarCobro(user, id);
  }

  @Roles(...RECEPTION_AND_UP)
  @Post('cobros/:id/lineas')
  agregarLinea(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LineaDelCobroDto,
    @CurrentUser() user: User,
  ) {
    return this.boletas.agregarLinea(user, id, dto);
  }

  @Roles(...RECEPTION_AND_UP)
  @Patch('cobros/:id/lineas/:lineaId')
  editarLinea(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineaId', ParseIntPipe) lineaId: number,
    @Body() dto: EditarLineaDelCobroDto,
    @CurrentUser() user: User,
  ) {
    return this.boletas.editarLinea(user, id, lineaId, dto);
  }

  @Roles(...RECEPTION_AND_UP)
  @Delete('cobros/:id/lineas/:lineaId')
  quitarLinea(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineaId', ParseIntPipe) lineaId: number,
    @CurrentUser() user: User,
  ) {
    return this.boletas.quitarLinea(user, id, lineaId);
  }

  @Roles(...RECEPTION_AND_UP)
  @Post('cobros/:id/emitir')
  emitir(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    this.logger.info(`POST /boletas/cobros/${id}/emitir`);
    return this.boletas.emitir(user, id);
  }
}
