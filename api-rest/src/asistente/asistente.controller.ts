import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  Param,
  ParseUUIDPipe,
  Post,
  Res,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
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

  // LA RESPUESTA EN VIVO (doc 20 §9): la misma pregunta, pero el texto va
  // llegando mientras BelIA lo escribe (text/event-stream): «texto» con cada
  // trozo, «herramientas» cuando va a buscar algo, y al final «fin» con la
  // respuesta completa y sus tarjetas. Lo que se rechaza antes de empezar
  // (el tope, el cargo, el derecho) responde como siempre, con su código; lo
  // que falla a mitad de camino llega como un evento «error».
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('mensajes/en-vivo')
  async enVivo(
    @Body() body: MensajeDto,
    @CurrentUser() user: User,
    @Res() res: Response,
  ) {
    this.logger.info('POST /asistente/mensajes/en-vivo');
    let abierta = false;
    const enviar = (evento: string, datos: unknown) => {
      if (!abierta) {
        abierta = true;
        res.status(200);
        res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        // Que ningún proxy junte los trozos antes de mandarlos.
        res.setHeader('X-Accel-Buffering', 'no');
        res.flushHeaders();
      }
      res.write(`event: ${evento}\ndata: ${JSON.stringify(datos)}\n\n`);
    };
    try {
      const r = await this.asistente.responder(body, user, (e) =>
        enviar(e.tipo, e),
      );
      enviar('fin', r);
    } catch (e) {
      if (!abierta) throw e;
      enviar('error', {
        status: e instanceof HttpException ? e.getStatus() : 500,
        message: mensajeHttp(e),
      });
    }
    res.end();
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

/** El texto de un error para el evento «error» de la respuesta en vivo. */
const mensajeHttp = (e: unknown): string => {
  if (e instanceof HttpException) {
    const r = e.getResponse();
    const m = typeof r === 'string' ? r : (r as { message?: unknown }).message;
    if (typeof m === 'string' && m) return m;
  }
  return 'BelIA no pudo responder. Intenta de nuevo en un rato.';
};
