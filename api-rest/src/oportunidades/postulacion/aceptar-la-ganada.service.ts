import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { CreatePaymentPlanDto } from 'src/payments/dto/create-payment-plan.dto';
import { PaymentsService } from 'src/payments/payments.service';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import { pesos } from 'src/quotations/generar/catalogo';
import { hoyEnChile } from '../analisis/comun';
import { PostulacionRepository } from './postulacion.repository';

// LA COTIZACIÓN DE UNA LICITACIÓN GANADA QUEDA ACEPTADA (decisión 104 del
// doc 17, 28-10). Felipe: "si esta ganada la licitación la cotización debe
// quedar como aceptada con un plan de pagos a 30 dias post realización del
// evento", la que se crea desde la ganada y la que ya estaba vinculada
// ("Sí, me parece bien. Ambos casos."). Como hizo él a mano con la N° 679
// de la 1030177-85-COT26: una sola cuota por el total, 30 días después del
// último día del servicio. Sin el correo del plan: el comprador es un
// organismo público, que paga contra la orden de compra.

/** Desde qué estados se acepta sola: lo que todavía no es un evento. Una
 *  aceptada o realizada ya tiene su plan; una anulada o rechazada no se
 *  revive. */
const SE_ACEPTA: readonly string[] = [
  'solicitada',
  'enviada',
  'en_negociacion',
];

export const DIAS_PARA_PAGAR = 30;

export type CotizacionAceptada = {
  numero: number;
  /** AAAA-MM-DD: cuándo vence la cuota. */
  vence: string;
  total: number;
};

/** AAAA-MM-DD más n días (al mediodía UTC: sin saltos de zona horaria). */
const masDias = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** La tarea que deja al aceptarla (Felipe, 28-10: "dejale un seguimiento
 *  de esos rojo diciendo validar servicios contra licitación"). Con fecha
 *  de ayer el compromiso nace vencido: el hilo de seguimiento muestra la
 *  franja roja «Contacto comprometido» con «Registrar gestión» y «Listo»
 *  desde que se acepta. */
export const validarServicios = (codigo: string, ahora = new Date()) => ({
  tipo: 'otro' as const,
  next_contact_date: masDias(hoyEnChile(ahora), -1),
  note: `Validar servicios contra licitación ${codigo}.`,
});

@Injectable()
export class AceptarLaGanadaService {
  constructor(
    private readonly repo: PostulacionRepository,
    private readonly pagos: PaymentsService,
    private readonly bitacora: QuotationFollowupsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(AceptarLaGanadaService.name);
  }

  /** Deja aceptada la cotización de una licitación ganada, con una cuota
   *  por el total a 30 días del último día del servicio, y lo anota en su
   *  bitácora a nombre del Asistente, con la tarea de validar los servicios
   *  contra la licitación. Lo que ya es un evento, lo anulado y lo que no
   *  tiene fecha ni total quedan como están. Nunca lanza: null si no la
   *  aceptó. */
  async aceptar(
    companyId: number,
    quotationId: string,
    codigo: string,
  ): Promise<CotizacionAceptada | null> {
    try {
      const q = await this.repo.cotizacion(companyId, { id: quotationId });
      if (!q || !SE_ACEPTA.includes(q.quotation_status)) return null;
      const ultimoDia = (q.event_end_date ?? q.event_date)?.slice(0, 10);
      const total = Number(q.total_amount ?? 0);
      if (!ultimoDia || !(total > 0)) {
        this.logger.warn(
          `ganada ${codigo}: la N° ${q.quotation_number} no se aceptó sola (${ultimoDia ? 'sin total' : 'sin fecha'})`,
        );
        return null;
      }
      const vence = masDias(ultimoDia, DIAS_PARA_PAGAR);
      await this.pagos.createPaymentPlan(
        {
          quotation_id: q.id,
          payments: [
            {
              payment_type: 'Cuota 1',
              amount: total,
              due_date: vence,
              notes: `Licitación ${codigo}: a ${DIAS_PARA_PAGAR} días del servicio.`,
            },
          ],
        } as unknown as CreatePaymentPlanDto,
        companyId,
        { sinCorreo: true },
      );
      await this.anotar(companyId, codigo, {
        quotation_id: q.id,
        tipo: 'otro',
        next_contact_date: null,
        note: `Aceptada sola: la licitación ${codigo} salió ganada. Una cuota por el total (${pesos(total)}) que vence el ${vence}, ${DIAS_PARA_PAGAR} días después del servicio. No se le mandó el correo del plan al comprador.`,
      });
      // Después: el compromiso vivo es la nota más reciente con fecha.
      await this.anotar(companyId, codigo, {
        quotation_id: q.id,
        ...validarServicios(codigo),
      });
      this.logger.info(
        `ganada ${codigo}: la N° ${q.quotation_number} quedó aceptada, cuota al ${vence}`,
      );
      return { numero: q.quotation_number, vence, total };
    } catch (error) {
      this.logger.error(
        `ganada ${codigo}: no pude aceptar su cotización: ${mensajeDe(error)}`,
      );
      return null;
    }
  }

  /** Una línea en la bitácora a nombre del Asistente. Si falla, solo lo
   *  avisa: la cotización ya quedó aceptada. */
  private anotar(
    companyId: number,
    codigo: string,
    nota: Parameters<QuotationFollowupsService['crearComoAsistente']>[1],
  ) {
    return this.bitacora
      .crearComoAsistente(companyId, nota)
      .catch((error: unknown) =>
        this.logger.warn(
          `ganada ${codigo}: no pude anotar en la bitácora: ${mensajeDe(error)}`,
        ),
      );
  }
}
