import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { marcaDesdeFila } from './marca';
import { MarketingRepository } from './marketing.repository';
import { MarketingService } from './marketing.service';

/**
 * EL RELOJ DE LAS CAMPAÑAS PROGRAMADAS (04-09, capítulo "Programar
 * envío" del doc 11 — ruta B elegida por Felipe: el reloj del motor,
 * no el scheduled_at de Resend, que no programa lotes).
 *
 * Cada minuto toma las campañas cuya hora llegó y llama AL MISMO
 * despacho de siempre — lotes, regla de una vez, supresiones de hoy,
 * audiencia recalculada al enviar, y la copia del capitán a quien la
 * programó. El candado atómico (tomarProgramada) garantiza un solo
 * disparo; si el despacho falla, la campaña quedó en borrador con la
 * programación limpia y el error en el log — visible como no-enviada,
 * jamás en reintentos infinitos silenciosos.
 *
 * Como todos los crones de la casa, corre SOLO en producción
 * (ScheduleModule condicionado a NODE_ENV en app.module).
 */
@Injectable()
export class MarketingCronService {
  constructor(
    private readonly marketing: MarketingService,
    private readonly repo: MarketingRepository,
    private readonly companies: CompaniesRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MarketingCronService.name);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async despacharProgramadas() {
    const vencidas = await this.repo.programadasVencidas();
    for (const c of vencidas) {
      const tomada = await this.repo.tomarProgramada(c.id, c.company_id);
      if (!tomada) continue; // otro reloj se la llevó
      try {
        // La MISMA marca que arma el controller: si la consulta falla,
        // NO se despacha con marca genérica — el catch la deja en
        // borrador y el error queda a la vista en el log.
        const { data, error } = await this.companies.findOne(c.company_id);
        if (error && error.code !== 'PGRST116') throw error;
        const marca = data
          ? marcaDesdeFila(data)
          : marcaDesdeFila({ name: 'Eventia' });
        const r = await this.marketing.enviarCampana(
          c.id,
          c.company_id,
          marca,
          c.programada_por ?? undefined,
        );
        this.logger.info(
          `campaña programada ${c.id} despachada: ${r.enviados} ok, ${r.fallidos} fallidos`,
        );
      } catch (e) {
        this.logger.error(
          `campaña programada ${c.id} falló al dispararse (queda en borrador): ${
            e instanceof Error ? e.message : String(e)
          }`,
        );
      }
    }
  }
}
