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
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import { UserRole, type User } from 'src/users/entities/user.entity';
import {
  AbrirCajaDto,
  CerrarCajaDto,
  CorregirMedioDto,
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

@Derecho('facturacion')
@Controller('facturacion/caja')
export class CajaController {
  constructor(private readonly caja: CajaService) {}

  @Permiso('caja_recepcion')
  @Get()
  @Roles(...OPERAN_LA_CAJA)
  estado(@CurrentUser() user: User) {
    return this.caja.estado(user);
  }

  @Permiso('caja_recepcion')
  @Post('abrir')
  @Roles(...OPERAN_LA_CAJA)
  abrir(@Body() dto: AbrirCajaDto, @CurrentUser() user: User) {
    return this.caja.abrir(user, dto);
  }

  @Permiso('caja_recepcion')
  @Post('retiros')
  @Roles(...OPERAN_LA_CAJA)
  retiro(@Body() dto: RetiroDeCajaDto, @CurrentUser() user: User) {
    return this.caja.retiro(user, dto);
  }

  @Permiso('caja_recepcion')
  @Post('cerrar')
  @Roles(...OPERAN_LA_CAJA)
  cerrar(@Body() dto: CerrarCajaDto, @CurrentUser() user: User) {
    return this.caja.cerrar(user, dto);
  }

  /** «Lo vendido» (sprint 3): con el permiso de revisar los cierres. */
  @Permiso('caja_revision')
  @Get('vendido')
  @Roles(...ADMIN_ONLY)
  vendido(@Query() q: LoVendidoQueryDto, @CurrentUser() user: User) {
    return this.caja.vendido(user, q);
  }

  @Permiso('caja_revision')
  @Get('cierres')
  @Roles(...ADMIN_ONLY)
  cierres(@CurrentUser() user: User) {
    return this.caja.cierres(user);
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
