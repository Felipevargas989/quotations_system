import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { Derecho } from 'src/auth/derecho.decorator';
import { Roles, SALES_AND_UP } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { AsistenteService } from './asistente.service';
import { MensajeDto } from './dto/mensaje.dto';

// Evia, la ventanilla de chat (doc 20). La usan quienes venden y arriba
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

  // Cada pregunta cuesta: 20 por minuto por persona sobra para conversar.
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @HttpCode(200)
  @Post('mensajes')
  responder(@Body() body: MensajeDto, @CurrentUser() user: User) {
    this.logger.info('POST /asistente/mensajes');
    return this.asistente.responder(body, user);
  }
}
