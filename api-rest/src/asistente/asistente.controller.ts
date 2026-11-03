import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Roles, SALES_AND_UP } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { AsistenteService } from './asistente.service';
import { MensajeDto } from './dto/mensaje.dto';

// BelIA, la ventanilla de chat (doc 20). La usan quienes venden y arriba
// (Felipe, 03-11: "lo usa administración y vendedores"), y solo la empresa
// con el módulo propio `asistente` (Valle del Sol, migración 180).
@Roles(...SALES_AND_UP)
@Derecho('asistente')
@Controller('asistente')
export class AsistenteController {
  constructor(
    private readonly asistente: AsistenteService,
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
}
