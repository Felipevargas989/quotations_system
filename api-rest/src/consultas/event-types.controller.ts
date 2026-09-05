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
import type { User } from 'src/users/entities/user.entity';
import { ActualizarTipoDto, CrearTipoDeEventoDto } from './dto/consultas.dto';
import { EventTypesService } from './event-types.service';

/** Tipos de evento administrables (05-09, doc 12). El administrador
 *  vive en la página Consultas; el formulario público lee la lista
 *  por la puerta pública, como los tipos de cliente. */
@Controller('event-types')
export class EventTypesController {
  constructor(
    private readonly tipos: EventTypesService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(EventTypesController.name);
  }

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

  @Post()
  crear(@Body() dto: CrearTipoDeEventoDto, @CurrentUser() user: User) {
    this.logger.info(`POST /event-types "${dto.name}"`);
    return this.tipos.crear(user.company_id, dto.name);
  }

  @Patch(':id')
  actualizar(
    @Param('id') id: string,
    @Body() dto: ActualizarTipoDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`PATCH /event-types/${id} ${JSON.stringify(dto)}`);
    return this.tipos.actualizar(+id, user.company_id, dto);
  }

  @Delete(':id')
  eliminar(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`DELETE /event-types/${id}`);
    return this.tipos.eliminar(+id, user.company_id);
  }
}
