import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { ADMIN_ONLY, RECEPTION_AND_UP, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { ConsultasService } from './consultas.service';
import { GuardarConfigDto } from './dto/consultas.dto';

/**
 * El embudo de consultas (05-09, doc 12). La PUERTA de entrada no está
 * acá: es el formulario público de cotizaciones, que bifurca hacia el
 * embudo cuando el tipo de evento tiene brochures configurados. Acá
 * vive la gestión: la lista, la configuración, convertir y descartar.
 */
@Controller('consultas')
export class ConsultasController {
  constructor(
    private readonly consultas: ConsultasService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ConsultasController.name);
  }

  @Roles(...RECEPTION_AND_UP)
  @Get()
  listar(@CurrentUser() user: User) {
    return this.consultas.listar(user.company_id);
  }

  @Roles(...RECEPTION_AND_UP)
  @Get('config')
  configs(@CurrentUser() user: User) {
    return this.consultas.configs(user.company_id);
  }

  @Roles(...ADMIN_ONLY)
  @Put('config/:eventType')
  guardarConfig(
    @Param('eventType') eventType: string,
    @Body() dto: GuardarConfigDto,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`PUT /consultas/config/${eventType}`);
    return this.consultas.guardarConfig(user.company_id, eventType, dto);
  }

  @Roles(...RECEPTION_AND_UP)
  @Post(':id/convertir')
  convertir(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`POST /consultas/${id}/convertir`);
    return this.consultas.convertir(+id, user.company_id);
  }

  @Roles(...RECEPTION_AND_UP)
  @Post(':id/descartar')
  descartar(@Param('id') id: string, @CurrentUser() user: User) {
    this.logger.info(`POST /consultas/${id}/descartar`);
    return this.consultas.descartar(+id, user.company_id);
  }
}
