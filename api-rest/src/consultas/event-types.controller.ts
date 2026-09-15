import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser, Public } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, RECEPTION_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { ActualizarTipoDto, CrearTipoDeEventoDto } from './dto/consultas.dto';
import { EventTypesService } from './event-types.service';

/** Tipos de evento administrables (05-09, doc 12). El administrador
 *  vive en la página Consultas; el formulario público lee la lista
 *  por la puerta pública, como los tipos de cliente. */
// Administrar los tipos de evento es parte de Consultas (Opera y
// Crece, paso 3.2). Leer la lista NO: el cotizador y el formulario
// público la piden en todos los planes, y por eso el GET de abajo va
// abierto con @Derecho(null).
@Derecho('consultas')
@Controller('event-types')
export class EventTypesController {
  constructor(
    private readonly tipos: EventTypesService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EventTypesController.name);
  }

  // La lee el cotizador en cualquier plan: abierta a propósito.
  @Derecho(null)
  @Roles(...RECEPTION_AND_UP)
  @Get()
  listar(@CurrentUser() user: User) {
    return this.tipos.listar(user.company_id);
  }

  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @Public()
  @Get('public/:companyId')
  listarPublico(@Param('companyId') companyId: string) {
    return this.tipos.listarPublico(+companyId);
  }

  @Roles(...ADMIN_ONLY)
  @Post()
  crear(@Body() dto: CrearTipoDeEventoDto, @CurrentUser() user: User) {
    this.logger.info(`POST /event-types "${dto.name}"`);
    return this.tipos.crear(user.company_id, dto.name);
  }

  @Roles(...ADMIN_ONLY)
  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarTipoDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`PATCH /event-types/${id} ${JSON.stringify(dto)}`);
    return this.tipos.actualizar(+id, user.company_id, dto);
  }

  @Roles(...ADMIN_ONLY)
  @Delete(':id')
  eliminar(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`DELETE /event-types/${id}`);
    return this.tipos.eliminar(+id, user.company_id);
  }
}
