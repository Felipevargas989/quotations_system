import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { EmailService } from 'src/email/email.service';
import { WeeklyDigestParams } from 'src/email/templates/weeklyDigest/types';
import { EmailStructure } from 'src/email/types';
import { UserRole } from 'src/users/entities/user.entity';
import { UsersService } from 'src/users/users.service';
import { normalizeDateToUtc } from 'src/utils/dates';
import { QuotationStatus, RequestType } from './constants/constants';
import { QuotationsRepository } from './quotations.repository';

/**
 * Crons de cotizaciones. Desde el 29-07-2026 (plan anti-spam de
 * Felipe) los dos correos DIARIOS al equipo ("eventos en 3 días" y
 * "resumen de cotizaciones") se fusionaron en UN resumen SEMANAL que
 * sale los lunes en la mañana — y solo si hay algo que contar.
 * Los avisos de cobranza siguen siendo inmediatos (payments-cron).
 */
@Injectable()
export class QuotationsCronService {
  constructor(
    private readonly quotationsRepository: QuotationsRepository,
    private readonly usersService: UsersService,
    private readonly emailService: EmailService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QuotationsCronService.name);
  }

  // Lunes 11:00 UTC = 07:00 de Chile (horario de invierno).
  @Cron('0 11 * * 1')
  async sendWeeklyDigest() {
    this.logger.info('CRON job: weekly digest');
    try {
      type Resumen = {
        companyName?: string;
        eventos: WeeklyDigestParams['eventos'];
        pipeline: WeeklyDigestParams['pipeline'];
      };
      const porEmpresa: Record<number, Resumen> = {};
      const resumenDe = (companyId: number, name?: string): Resumen => {
        if (!porEmpresa[companyId]) {
          porEmpresa[companyId] = {
            companyName: name,
            eventos: [],
            pipeline: { solicitadas: 0, enviadas: 0, enNegociacion: 0 },
          };
        }
        if (name && !porEmpresa[companyId].companyName) {
          porEmpresa[companyId].companyName = name;
        }
        return porEmpresa[companyId];
      };

      // 1. Eventos aceptados de ESTA semana (el cron corre lunes:
      //    hoy + 0..6 = lunes a domingo).
      for (let offset = 0; offset < 7; offset++) {
        const dia = new Date();
        dia.setDate(dia.getDate() + offset);
        const eventos = await this.quotationsRepository.findAll({
          company_id: undefined,
          statuses: [QuotationStatus.ACEPTADA],
          request_type: RequestType.COTIZACION,
          event_date: normalizeDateToUtc(dia),
        });
        for (const ev of eventos) {
          const fecha = dia.toLocaleDateString('es-CL', {
            weekday: 'short',
            day: 'numeric',
          });
          resumenDe(ev.company_id, ev.companies?.name).eventos.push({
            fecha,
            tipo: ev.event_type || 'Evento',
            personas: ev.people_count,
          });
        }
      }

      // 2. Pipeline vigente (lo que cubría el resumen diario).
      const enCurso = await this.quotationsRepository.findAll({
        company_id: undefined,
        statuses: [
          QuotationStatus.SOLICITADA,
          QuotationStatus.ENVIADA,
          QuotationStatus.EN_NEGOCIACION,
        ],
      });
      for (const q of enCurso) {
        const r = resumenDe(q.company_id, q.companies?.name);
        if (q.quotation_status === QuotationStatus.SOLICITADA) {
          r.pipeline.solicitadas++;
        } else if (q.quotation_status === QuotationStatus.ENVIADA) {
          r.pipeline.enviadas++;
        } else {
          r.pipeline.enNegociacion++;
        }
      }

      // 3. Etiqueta de la semana ("semana del 3 al 9 de agosto").
      const lunes = new Date();
      const domingo = new Date();
      domingo.setDate(domingo.getDate() + 6);
      const corto = (d: Date) =>
        d.toLocaleDateString('es-CL', { day: 'numeric', month: 'long' });
      const weekLabel = `semana del ${corto(lunes)} al ${corto(domingo)}`;

      // 4. Enviar por empresa — solo si hay algo que contar.
      for (const [companyId, r] of Object.entries(porEmpresa)) {
        const totalPipeline =
          r.pipeline.solicitadas +
          r.pipeline.enviadas +
          r.pipeline.enNegociacion;
        if (r.eventos.length === 0 && totalPipeline === 0) continue;

        const admins = await this.usersService.findAll(
          Number.parseInt(companyId),
          UserRole.ADMINISTRADOR,
        );
        const adminEmails = admins.map((admin) => admin.email);
        if (!adminEmails.length) continue;

        await this.emailService.sendEmail(
          adminEmails,
          EmailStructure.WEEKLY_DIGEST,
          {
            companyName: r.companyName || 'tu empresa',
            weekLabel,
            eventos: r.eventos,
            pipeline: r.pipeline,
          },
        );
      }
    } catch (error) {
      this.logger.error('Error sending weekly digest:', error);
      throw error;
    }
  }
}
