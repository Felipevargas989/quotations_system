import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Permiso } from 'src/auth/permiso.decorator';
import { ADMIN_ONLY, OPERATIONS_AND_UP, Roles } from 'src/auth/roles.decorator';
import { UserRole, type User } from 'src/users/entities/user.entity';
import {
  AbrirCajaDto,
  CerrarCajaDto,
  CorregirMedioDto,
  GastoDeCajaDto,
  IngresoDeCajaDto,
  LoVendidoQueryDto,
  RetiroDeCajaDto,
  RevisarCierreDto,
} from './caja.dto';
import { CajaService } from './caja.service';

// LA CAJA DE RECEPCIÓN (doc 19 §9.43, sprint 2). Dos permisos, como los
// aprobó Felipe el 09-11: operar la caja («Caja de recepción», de fábrica
// recepción y el administrador) y revisar los cierres («Revisar cierres de
// caja», de fábrica el administrador). El `@Roles` de cada puerta es lo de
// fábrica del catálogo (`auth/permisos.ts`), como exige la prueba de
// fábrica.
const OPERAN_LA_CAJA = [UserRole.RECEPCION, UserRole.ADMINISTRADOR];
// §9.55: la caja abierta la ven quien la opera y quien anota movimientos.
const VEN_LA_CAJA_ABIERTA = [
  UserRole.RECEPCION,
  UserRole.OPERACIONES,
  UserRole.ADMINISTRADOR,
];

@Derecho('facturacion')
@Controller('facturacion/caja')
export class CajaController {
  constructor(private readonly caja: CajaService) {}

  /** El estado de la caja, ciego: quien la opera y, desde el 16-11 (doc 19
   *  §9.55), quien anota movimientos (operaciones de fábrica) o, desde el
   *  17-11 (§9.56), gastos. */
  @Permiso('caja_recepcion', 'caja_movimientos', 'caja_gastos')
  @Get()
  @Roles(...VEN_LA_CAJA_ABIERTA)
  estado(@CurrentUser() user: User) {
    return this.caja.estado(user);
  }

  /** §9.55: lo que debería haber en la caja abierta, por medio de pago.
   *  Solo quien revisa los cierres: recepción cierra a ciegas y nunca lo
   *  recibe (el estado de arriba no lo trae). */
  @Permiso('caja_revision')
  @Get('esperado')
  @Roles(...ADMIN_ONLY)
  esperado(@CurrentUser() user: User) {
    return this.caja.esperado(user);
  }

  @Permiso('caja_recepcion')
  @Post('abrir')
  @Roles(...OPERAN_LA_CAJA)
  abrir(@Body() dto: AbrirCajaDto, @CurrentUser() user: User) {
    return this.caja.abrir(user, dto);
  }

  /** §9.55: anotar movimientos es su propio interruptor (de fábrica,
   *  operaciones y el administrador; recepción ya no). */
  @Permiso('caja_movimientos')
  @Post('retiros')
  @Roles(...OPERATIONS_AND_UP)
  retiro(@Body() dto: RetiroDeCajaDto, @CurrentUser() user: User) {
    return this.caja.retiro(user, dto);
  }

  /** §9.51: la plata que mandan el dueño o la administradora. */
  @Permiso('caja_movimientos')
  @Post('ingresos')
  @Roles(...OPERATIONS_AND_UP)
  ingreso(@Body() dto: IngresoDeCajaDto, @CurrentUser() user: User) {
    return this.caja.ingreso(user, dto);
  }

  /** §9.56: los gastos son su propio interruptor (de fábrica recepción,
   *  operaciones y el administrador). */
  @Permiso('caja_gastos')
  @Post('gastos')
  @Roles(...VEN_LA_CAJA_ABIERTA)
  gasto(@Body() dto: GastoDeCajaDto, @CurrentUser() user: User) {
    return this.caja.gasto(user, dto);
  }

  @Permiso('caja_recepcion')
  @Post('cerrar')
  @Roles(...OPERAN_LA_CAJA)
  cerrar(@Body() dto: CerrarCajaDto, @CurrentUser() user: User) {
    return this.caja.cerrar(user, dto);
  }

  /** «Lo vendido» (sprint 3), su propia pestaña: operaciones y el
   *  administrador de fábrica. */
  @Permiso('facturacion_vendido')
  @Get('vendido')
  @Roles(...OPERATIONS_AND_UP)
  vendido(@Query() q: LoVendidoQueryDto, @CurrentUser() user: User) {
    return this.caja.vendido(user, q);
  }

  @Permiso('caja_revision')
  @Get('cierres')
  @Roles(...ADMIN_ONLY)
  cierres(@CurrentUser() user: User) {
    return this.caja.cierres(user);
  }

  /** §9.54: las tres cifras de la cadena del efectivo (7 días). Va antes
   *  de `cierres/:id`. */
  @Permiso('caja_revision')
  @Get('cierres/resumen')
  @Roles(...ADMIN_ONLY)
  resumenDeCierres(@CurrentUser() user: User) {
    return this.caja.resumenDeCierres(user);
  }

  @Permiso('caja_revision')
  @Get('cierres/:id')
  @Roles(...ADMIN_ONLY)
  cierre(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.caja.cierre(user, id);
  }

  @Permiso('caja_revision')
  @Patch('cierres/:id/documentos/:documentoId')
  @Roles(...ADMIN_ONLY)
  corregirMedio(
    @Param('id', ParseIntPipe) id: number,
    @Param('documentoId', ParseIntPipe) documentoId: number,
    @Body() dto: CorregirMedioDto,
    @CurrentUser() user: User,
  ) {
    return this.caja.corregirMedio(user, id, documentoId, dto);
  }

  /** §9.45: el medio de una solicitud de recepción del turno. */
  @Permiso('caja_revision')
  @Patch('cierres/:id/solicitudes/:solicitudId')
  @Roles(...ADMIN_ONLY)
  corregirMedioDeSolicitud(
    @Param('id', ParseIntPipe) id: number,
    @Param('solicitudId', ParseIntPipe) solicitudId: number,
    @Body() dto: CorregirMedioDto,
    @CurrentUser() user: User,
  ) {
    return this.caja.corregirMedioDeSolicitud(user, id, solicitudId, dto);
  }

  @Permiso('caja_revision')
  @Post('cierres/:id/revisar')
  @Roles(...ADMIN_ONLY)
  revisar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RevisarCierreDto,
    @CurrentUser() user: User,
  ) {
    return this.caja.revisar(user, id, dto);
  }
}
