import { Controller, HttpException, HttpStatus, Post } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { SinPlan } from 'src/auth/derecho.decorator';
import type { User } from 'src/users/entities/user.entity';
import { PlansService } from './plans.service';

@Controller('plans')
export class PlansController {
  constructor(
    private readonly plansService: PlansService,
    private readonly logger: PinoLogger,
  ) {}

  // Apagada el 14-09-2026 (paso 2 del roadmap de venta): esta puerta
  // marcaba is_premium = true a cualquier sesión que la abriera, sin
  // verificar ningún pago. La activación real llega con el cobro
  // automático (paso 5). Se responde 410 para que la pantalla lo diga.
  // La pantalla de Planes es justamente por donde vuelve una empresa
  // bloqueada, así que no puede cerrarse por plan (paso 3.2).
  @SinPlan()
  @Post('confirmation')
  confirmPlan(@CurrentUser() user: User) {
    this.logger.warn(
      `POST /plans/confirmation rechazado (puerta apagada) user ${user.id}`,
    );
    throw new HttpException(
      'La activación del plan ya no se hace por esta vía. Escríbenos y la activamos.',
      HttpStatus.GONE,
    );
  }
}
