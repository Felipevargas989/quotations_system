import { Body, Controller, Headers, Post, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { PinoLogger } from 'nestjs-pino';
import { Public } from 'src/auth/public.decorator';
import { logSafe } from 'src/logging/log-safe';
import { AltaLicitaDto } from './dto/alta-licita.dto';
import { LicitaService } from './licita.service';
import { SoloEnLicitaGuard } from './solo-en-licita.guard';

// LAS PUERTAS PROPIAS DE LICITA (25-11). Solo existen con INSTALACION=licita
// (`SoloEnLicitaGuard`: en Eventia, 404 como una ruta que no existe).
//
// POST /licita/alta: pública para `AuthGuard`, que exigiría una fila en
// `user_profiles` que esta persona todavía no tiene; el pase de Supabase
// (`Authorization: Bearer`) lo valida el servicio. Mismo techo que el alta
// pública de Eventia (10 por minuto por IP).
@Controller('licita')
@UseGuards(SoloEnLicitaGuard)
export class LicitaController {
  constructor(
    private readonly licitaService: LicitaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LicitaController.name);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('alta')
  alta(
    @Headers('authorization') authorization: string | undefined,
    @Body() dto: AltaLicitaDto,
  ) {
    this.logger.info(`POST /licita/alta with dto ${logSafe(dto)}`);
    return this.licitaService.alta(authorization, dto);
  }
}
