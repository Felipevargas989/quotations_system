import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Roles, SALES_AND_UP } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { AsistenteService } from './asistente.service';
import { MensajeDto } from './dto/mensaje.dto';
import { PropuestasService } from './propuestas/propuestas.service';

// BelIA, la ventanilla de chat (doc 20). La usan quienes venden y arriba
// (Felipe, 03-11: "lo usa administración y vendedores"), y solo la empresa
// con el módulo propio `asistente` (Valle del Sol, migración 180).
@Roles(...SALES_AND_UP)
@Derecho('asistente')
@Controller('asistente')
export class AsistenteController {
  constructor(
    private readonly asistente: AsistenteService,
    private readonly propuestas: PropuestasService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AsistenteController.name);
  }

  // El ánimo de BelIA en la ventanilla (doc 20 §8b): lo vencido y lo
  // nuevo de hoy. No llama a la IA, así que no cuenta para el tope.
  @Get('estado')
  estado(@CurrentUser() user: User) {
    this.logger.info('GET /asistente/estado');
    return this.asistente.estado(user);
  }

  // Cada pregunta cuesta: 20 por minuto por persona sobra para conversar.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('mensajes')
  responder(@Body() body: MensajeDto, @CurrentUser() user: User) {
    this.logger.info('POST /asistente/mensajes');
    return this.asistente.responder(body, user);
  }

  // FASE 2 (doc 20 §3, regla 3): el «Sí, aplicar», el «No» y el «Deshacer»
  // de la tarjeta. No llaman a la IA. El cargo de cada cotización (las
  // aceptadas, solo administración y operaciones) lo revisa el servicio.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('propuestas/:id/aplicar')
  aplicar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /asistente/propuestas/${id}/aplicar`);
    return this.propuestas.aplicar(user, id);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('propuestas/:id/descartar')
  descartar(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /asistente/propuestas/${id}/descartar`);
    return this.propuestas.descartar(user, id);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('propuestas/:id/deshacer')
  deshacer(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentUser() user: User,
  ) {
    this.logger.info(`POST /asistente/propuestas/${id}/deshacer`);
    return this.propuestas.deshacer(user, id);
  }
}
