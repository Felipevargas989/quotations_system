import { Controller, Get, Param } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Public } from 'src/auth';
import { QuotationsService } from './quotations.service';

/**
 * Portal del cliente, Fase 2a (30-07-2026): la única puerta PÚBLICA de
 * lectura de una cotización, protegida por su enlace secreto de 64
 * caracteres (migración 47). Token inválido = 404 sin pistas. Los
 * límites de frecuencia globales aplican como en toda ruta pública.
 */
@Controller('portal')
export class PortalController {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PortalController.name);
  }

  @Public()
  @Get(':token')
  getPortal(@Param('token') token: string) {
    this.logger.info('GET /portal (token oculto)');
    return this.quotationsService.getPortalData(token);
  }
}
