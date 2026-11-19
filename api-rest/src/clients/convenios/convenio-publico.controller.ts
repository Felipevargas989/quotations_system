import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PinoLogger } from 'nestjs-pino';
import { Public } from 'src/auth/public.decorator';
import { AceptarConvenioDto } from './convenio.dto';
import { ConveniosService } from './convenios.service';

// La página pública del convenio (doc 24 §B): sin sesión, con el enlace
// personal. Con límite de intentos propio por IP, más bajo que el techo
// general: leer, 20 por minuto; aceptar, 5 por minuto.
@Public()
@Controller('convenio-publico')
export class ConvenioPublicoController {
  constructor(
    private readonly convenios: ConveniosService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ConvenioPublicoController.name);
  }

  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Get(':token')
  ver(@Param('token') token: string) {
    this.logger.info('GET /convenio-publico (enlace oculto)');
    return this.convenios.verPublico(token);
  }

  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post(':token/aceptar')
  @HttpCode(200)
  aceptar(
    @Param('token') token: string,
    @Body() dto: AceptarConvenioDto,
    @Req() req: Request,
  ) {
    this.logger.info('POST /convenio-publico/aceptar (enlace oculto)');
    const ua = req.headers['user-agent'];
    return this.convenios.aceptar(
      token,
      dto,
      req.ip ?? null,
      typeof ua === 'string' ? ua : null,
    );
  }
}
