import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { ConsultasService } from './consultas.service';

/**
 * EL RELOJ DEL EMBUDO DE CONSULTAS (05-09, doc 12): despacha los
 * brochures cuya hora citada llegó — la consulta entra, espera sus
 * 10 minutos y recién ahí sale la respuesta automática (una respuesta
 * instantánea delata al robot; Resend no programa correos con
 * adjuntos, así que el reloj es del motor, como el de las campañas).
 *
 * Como todos los crones de la casa, corre SOLO en producción
 * (ScheduleModule condicionado a NODE_ENV en app.module).
 */
@Injectable()
export class ConsultasCronService {
  constructor(
    private readonly consultas: ConsultasService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ConsultasCronService.name);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async despachar() {
    try {
      await this.consultas.despacharPendientes();
    } catch (e) {
      this.logger.error(
        `el reloj del embudo tropezó: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}
