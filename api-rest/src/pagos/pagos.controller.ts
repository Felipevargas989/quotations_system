import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Post,
  Query,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { CurrentUser } from 'src/auth';
import { SinPlan } from 'src/auth/derecho.decorator';
import { Public } from 'src/auth/public.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import type { User } from 'src/users/entities/user.entity';
import { SuscribirDto } from './dto/suscribir.dto';
import { verificarFirmaMercadoPago } from './firma';
import { MercadoPagoService } from './mercadopago.service';
import { PagosService } from './pagos.service';

// LAS PUERTAS DEL COBRO (16-09-2026, sprint B del paso 4+5).
//
// Tres y ninguna más:
//  - suscribir: con sesión, solo el administrador. Con @SinPlan a
//    propósito: una empresa BLOQUEADA tiene que poder pagar — cerrarle
//    la puerta de pago a un moroso es cerrarle la caja a Eventia.
//  - estado: la pantalla "estamos confirmando" pregunta acá.
//  - webhook: pública y con firma. La puerta de verdad es la FIRMA
//    (calco del webhook de Resend); el techo es holgado porque el
//    proveedor reenvía cada aviso cada 15 minutos hasta ver un 200.
@Controller('pagos')
export class PagosController {
  constructor(
    private readonly pagosService: PagosService,
    private readonly mercadoPago: MercadoPagoService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PagosController.name);
  }

  @Roles(...ADMIN_ONLY)
  @SinPlan()
  @Post('suscribir')
  suscribir(@CurrentUser() user: User, @Body() dto: SuscribirDto) {
    this.logger.info(
      `POST /pagos/suscribir plan ${dto.plan} por la empresa ${user.company_id}`,
    );
    return this.pagosService.suscribir(
      dto.plan,
      user.company_id,
      dto.correo_mercado_pago || user.email,
    );
  }

  @SinPlan()
  @Get('estado')
  estado(@CurrentUser() user: User) {
    return this.pagosService.estado(user.company_id);
  }

  // EL CAMBIO DE PLAN (18-09-2026). Dos tiempos: primero se cotiza (qué
  // costaría, desde cuándo rige) y se le muestra al cliente; después,
  // con su confirmación, se cambia. Solo el administrador, y solo una
  // empresa activa (sin @SinPlan: una bloqueada no cambia, contrata).
  @Roles(...ADMIN_ONLY)
  @Post('cambiar-plan/cotizar')
  cotizarCambio(@CurrentUser() user: User, @Body() dto: SuscribirDto) {
    return this.pagosService.cotizarCambio(user.company_id, dto.plan);
  }

  @Roles(...ADMIN_ONLY)
  @Post('cambiar-plan')
  cambiarPlan(@CurrentUser() user: User, @Body() dto: SuscribirDto) {
    this.logger.info(
      `POST /pagos/cambiar-plan a ${dto.plan} por la empresa ${user.company_id}`,
    );
    return this.pagosService.cambiarPlan(
      user.company_id,
      dto.plan,
      dto.correo_mercado_pago || user.email,
    );
  }

  @Public()
  // Techo holgado: los reenvíos del proveedor no pueden chocar con un
  // 429 — la puerta de verdad es la firma, no la velocidad (calco del
  // webhook de Resend).
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @HttpCode(200)
  @Post('webhook')
  async webhook(
    @Query('type') tipo: string | undefined,
    @Query('topic') topic: string | undefined,
    @Query('data.id') dataId: string | undefined,
    @Query('id') idViejo: string | undefined,
    @Body() cuerpo: unknown,
    @Headers('x-signature') xSignature?: string,
    @Headers('x-request-id') xRequestId?: string,
  ) {
    // Mercado Pago manda el aviso en la URL: type + data.id (el
    // formato viejo usa topic + id). El cuerpo solo se archiva.
    const tipoReal = tipo ?? topic ?? '';
    const idReal = dataId ?? idViejo ?? '';
    if (
      !verificarFirmaMercadoPago(
        this.mercadoPago.secretoDelWebhook,
        { xSignature, xRequestId },
        idReal,
        (m) => this.logger.warn(m),
      )
    ) {
      this.logger.warn(
        `aviso de pago con firma inválida (${tipoReal} ${idReal}): ignorado`,
      );
      return { ok: false };
    }
    if (!tipoReal || !idReal) {
      this.logger.warn('aviso de pago sin tipo o sin id: ignorado');
      return { ok: false };
    }
    const accion = await this.pagosService.procesarAviso(
      tipoReal,
      idReal,
      cuerpo,
    );
    this.logger.info(`aviso ${tipoReal} ${idReal}: ${accion}`);
    return { ok: true };
  }
}
