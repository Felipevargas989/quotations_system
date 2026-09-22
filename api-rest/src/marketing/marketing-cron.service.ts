import { Injectable } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { tieneDerecho } from 'src/auth/derechos';
import { DerechosService } from 'src/auth/derechos.service';
import { CompaniesRepository } from 'src/companies/companies.repository';
import { mensajeDe } from 'src/logging/mensaje-de-error';
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
    private readonly derechosService: DerechosService,
  ) {
    this.logger.setContext(MarketingCronService.name);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async despacharProgramadas() {
    const vencidas = await this.repo.programadasVencidas();
    for (const c of vencidas) {
      // Marketing es de Valle del Sol y no se vende (migración 111, ahora
      // un derecho más: paso 3.2). El filtro va ANTES de tomarProgramada:
      // tomarla y descartarla después dejaría la campaña en borrador sin
      // que nadie sepa por qué.
      const derechos = await this.derechosService.deEmpresa(c.company_id);
      if (!tieneDerecho(derechos.derechos, 'marketing')) continue;
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
          `campaña programada ${c.id} falló al dispararse (queda en borrador): ${mensajeDe(
            e,
          )}`,
        );
      }
    }
  }
}
