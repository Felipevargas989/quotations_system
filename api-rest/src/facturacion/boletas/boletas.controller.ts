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
import { DentroDe, Permiso } from 'src/auth/permiso.decorator';
import { ADMIN_ONLY, RECEPTION_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import {
  BoletaSueltaDto,
  CrearCobroDto,
  EditarCobroDto,
  EditarItemDelTarifarioDto,
  EditarLineaDelCobroDto,
  ItemDelTarifarioDto,
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
  @Permiso('boletas')
  @Get('por-boletear')
  porBoletear(
    @Query('quotation_id', new ParseUUIDPipe({ optional: true }))
    quotationId: string | undefined,
    @CurrentUser() user: User,
  ) {
    return this.boletas.porBoletear(user.company_id, quotationId);
  }

  @Roles(...RECEPTION_AND_UP)
  @Permiso('boletas')
  @Get('emitidas-hoy')
  emitidasHoy(@CurrentUser() user: User) {
    return this.boletas.emitidasHoy(user.company_id);
  }

  @Roles(...ADMIN_ONLY)
  @DentroDe('postventa', 'boletas')
  @Post('cobros')
  crearCobro(@Body() dto: CrearCobroDto, @CurrentUser() user: User) {
    this.logger.info('POST /boletas/cobros');
    return this.boletas.crearCobro(user, dto);
  }

  @Roles(...RECEPTION_AND_UP)
  @Permiso('boletas')
  @Patch('cobros/:id')
  editarCobro(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarCobroDto,
    @CurrentUser() user: User,
  ) {
    return this.boletas.editarCobro(user, id, dto);
  }

  @Roles(...ADMIN_ONLY)
  @DentroDe('postventa', 'boletas')
  @Delete('cobros/:id')
  borrarCobro(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: User,
  ) {
    return this.boletas.borrarCobro(user, id);
  }

  @Roles(...RECEPTION_AND_UP)
  @Permiso('boletas')
  @Post('cobros/:id/lineas')
  agregarLinea(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: LineaDelCobroDto,
    @CurrentUser() user: User,
  ) {
    return this.boletas.agregarLinea(user, id, dto);
  }

  @Roles(...RECEPTION_AND_UP)
  @Permiso('boletas')
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
  @Permiso('boletas')
  @Delete('cobros/:id/lineas/:lineaId')
  quitarLinea(
    @Param('id', ParseIntPipe) id: number,
    @Param('lineaId', ParseIntPipe) lineaId: number,
    @CurrentUser() user: User,
  ) {
    return this.boletas.quitarLinea(user, id, lineaId);
  }

  // El tarifario (D3, paso 3b): recepción lo lee para la boleta suelta; lo
  // escribe el administrador.
  @Roles(...RECEPTION_AND_UP)
  @Permiso('boletas')
  @Get('tarifario')
  tarifario(@CurrentUser() user: User) {
    return this.boletas.tarifario(user.company_id);
  }

  @Roles(...ADMIN_ONLY)
  @Permiso('facturacion_ajustes')
  @Post('tarifario')
  crearItem(@Body() dto: ItemDelTarifarioDto, @CurrentUser() user: User) {
    return this.boletas.crearItem(user, dto);
  }

  @Roles(...ADMIN_ONLY)
  @Permiso('facturacion_ajustes')
  @Patch('tarifario/:id')
  editarItem(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: EditarItemDelTarifarioDto,
    @CurrentUser() user: User,
  ) {
    return this.boletas.editarItem(user, id, dto);
  }

  @Roles(...ADMIN_ONLY)
  @Permiso('facturacion_ajustes')
  @Delete('tarifario/:id')
  borrarItem(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.boletas.borrarItem(user, id);
  }

  // La boleta suelta: recepción hacia arriba (D5); la línea a mano, solo el
  // administrador (lo revisa el servicio).
  @Roles(...RECEPTION_AND_UP)
  @Permiso('boletas')
  @Post('sueltas')
  emitirSuelta(@Body() dto: BoletaSueltaDto, @CurrentUser() user: User) {
    this.logger.info('POST /boletas/sueltas');
    return this.boletas.emitirSuelta(user, dto);
  }

  @Roles(...RECEPTION_AND_UP)
  @Permiso('boletas')
  @Post('cobros/:id/emitir')
  emitir(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    this.logger.info(`POST /boletas/cobros/${id}/emitir`);
    return this.boletas.emitir(user, id);
  }
}
