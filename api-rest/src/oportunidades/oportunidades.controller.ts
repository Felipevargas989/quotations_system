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
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { ActualizarOportunidadDto } from './dto/actualizar-oportunidad.dto';
import { GuardarConfigDto } from './dto/guardar-config.dto';
import { ListarOportunidadesDto } from './dto/listar-oportunidades.dto';
import { OportunidadesRepository } from './oportunidades.repository';
import { OportunidadesService } from './oportunidades.service';
import { RadarService } from './radar.service';

// La pantalla de Oportunidades (doc 17, sprint 2) y el radar.
//
// Solo administrador (Felipe, 17-10: "solo el administrador y Camila, que es
// perfil administrador"), y solo empresas con el derecho `oportunidades`
// (módulo propio de Valle del Sol, migración 122).
//
// Las rutas fijas van ANTES de las que llevan :id, o Nest intentaría leer
// "config" como un número.
@Roles(...ADMIN_ONLY)
@Derecho('oportunidades')
@Controller('oportunidades')
export class OportunidadesController {
  constructor(
    private readonly servicio: OportunidadesService,
    private readonly repo: OportunidadesRepository,
    private readonly radar: RadarService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OportunidadesController.name);
  }

  /** La bandeja de la empresa de la sesión. */
  @Get()
  listar(@Query() filtros: ListarOportunidadesDto, @CurrentUser() user: User) {
    return this.servicio.listar(user.company_id, filtros);
  }

  @Get('config')
  config(@CurrentUser() user: User) {
    return this.servicio.config(user.company_id);
  }

  @Patch('config')
  guardarConfig(@Body() dto: GuardarConfigDto, @CurrentUser() user: User) {
    return this.servicio.guardarConfig(user.company_id, dto);
  }

  /** Corre el radar ahora. Responde al tiro: la corrida sigue sola y queda
   *  en la bitácora (GET radar/corridas). */
  @Post('radar')
  async correrRadar(@CurrentUser() user: User) {
    this.logger.info(`POST /oportunidades/radar (empresa ${user.company_id})`);
    const corrida = await this.radar.iniciar('manual');
    return corrida === null
      ? { iniciada: false, motivo: 'Ya hay una corrida del radar en marcha.' }
      : { iniciada: true, corrida };
  }

  /** Las últimas corridas del radar: cuándo, qué trajo y qué falló. */
  @Get('radar/corridas')
  corridas() {
    return this.repo.ultimasCorridas(10);
  }

  @Get(':id')
  ficha(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: User) {
    return this.servicio.ficha(user.company_id, id);
  }

  @Patch(':id')
  actualizar(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ActualizarOportunidadDto,
    @CurrentUser() user: User,
  ) {
    return this.servicio.actualizar(user.company_id, id, dto);
  }
}
