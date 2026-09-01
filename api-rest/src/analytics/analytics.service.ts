import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { cachePanel, HORA_MS } from 'src/cache/memoria';
import { ClientsService } from 'src/clients/clients.service';
import { Company } from 'src/companies/entities/company.entity';
import {
  fechaDelUltimoAbono,
  PaymentsService,
} from 'src/payments/payments.service';
import {
  QuotationStatus,
  RequestType,
} from 'src/quotations/constants/constants';
import { QuotationsService } from 'src/quotations/quotations.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import { GetCompleteStatsDto } from './dto/get-complete-stats.dto';
import { CompleteStatsResponse, DashboardStatsResponse } from './types';
import { generateMonthRange } from './utils';
// La propina no es venta ni margen (24-07, Felipe): ver el porqué y la
// fórmula en quotations/utils/tip.ts.
import { saleWithoutTip } from 'src/quotations/utils/tip';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly clientsService: ClientsService,
    private readonly paymentsService: PaymentsService,
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {}

  async getDashboardStats(
    companyId: Company['id'],
    dateRange: { start_date?: Date; end_date?: Date },
  ): Promise<DashboardStatsResponse> {
    this.logger.info(
      `getDashboardStats with companyId ${companyId} and dateRange ${JSON.stringify(dateRange)}`,
    );
    try {
      // define date range
      const now = new Date();
      // param value or 12 months ago
      const start_date = dateRange.start_date
        ? new Date(dateRange.start_date)
        : new Date(now.getFullYear() - 1, now.getMonth(), 1);
      const end_date = dateRange.end_date
        ? new Date(dateRange.end_date)
        : new Date();

      // FASE VELOCIDAD (28-07): panel con memoria de 1 hora. Cualquier
      // cambio de cotización/pago/reembolso la borra al instante
      // (invalidarPanelEmpresa), así que nunca muestra números viejos.
      const clavePanel = `${companyId}:dash:${start_date.toISOString().slice(0, 10)}:${end_date.toISOString().slice(0, 10)}`;
      const enMemoria = cachePanel.get(clavePanel);
      if (enMemoria) return enMemoria as DashboardStatsResponse;

      // 1. FASE 1 (23-07): el período gobierna TODO el tablero.
      // Dos lecturas con roles distintos:
      //   - "quotations": las CREADAS dentro del período → contadores,
      //     desglose por estado, pipeline y cotizaciones por mes.
      //   - "concretadas": aceptadas/realizadas con EVENTO desde el
      //     inicio del período (sin tope: el futuro confirmado se pinta
      //     punteado) → eventos, ventas y caja.
      const ALL_STATUSES = [
        QuotationStatus.SOLICITADA,
        QuotationStatus.ENVIADA,
        QuotationStatus.EN_NEGOCIACION,
        QuotationStatus.ACEPTADA,
        QuotationStatus.RECHAZADA,
        QuotationStatus.REALIZADA,
        QuotationStatus.CANCELADA,
      ];
      // FASE VELOCIDAD: las tres lecturas no dependen entre sí — van
      // en paralelo en vez de en fila india.
      const [quotations, concretadas, clients] = await Promise.all([
        this.quotationsService.findAll({
          companyId,
          request_type: RequestType.COTIZACION,
          statuses: ALL_STATUSES,
          dateRange: { start_date, end_date },
        }),
        this.quotationsService.findAll({
          companyId,
          request_type: RequestType.COTIZACION,
          statuses: [QuotationStatus.ACEPTADA, QuotationStatus.REALIZADA],
          eventDateFrom: start_date,
        }),
        this.clientsService.findAll(companyId),
      ]);

      // get all payments
      // Caja: pagos de lo creado en el período + lo concretado con evento
      // en/desde el período; las CANCELADAS quedan fuera (conservan su
      // historia de pagos, pero no son caja esperada).
      const quotations_ids = [
        ...new Set(
          [...quotations, ...concretadas]
            .filter((q) => q.quotation_status !== QuotationStatus.CANCELADA)
            .map((quotation) => quotation.id),
        ),
      ];

      // add filter by quotation_id in the payments service
      const { data: payments } =
        await this.paymentsService.findAllPaymentsFromQuotation(
          quotations_ids,
          companyId,
        );

      // 2. calculate stats

      // get total clients
      const totalClients = clients.length;

      // get total quotations
      const totalQuotations = quotations.length;

      // get total quotations by status
      const totalQuotationsByStatus: DashboardStatsResponse['totalQuotationsByStatus'] =
        quotations.reduce(
          (acc, quotation) => {
            const status = quotation.quotation_status;
            if (!acc[status]) {
              acc[status] = { count: 0, amount: 0 };
            }

            acc[status].count += 1;

            // 24-07: SIN propina. Esto alimenta el embudo del pipeline,
            // la venta viva y el KPI "Ventas concretadas".
            acc[status].amount += saleWithoutTip(quotation);
            return acc;
          },
          {} as DashboardStatsResponse['totalQuotationsByStatus'],
        );

      // Initialize with all months in the date range
      const monthRange = generateMonthRange(start_date, end_date);

      // get quotations by month (by created_at)
      const totalQuotationsByMonth: DashboardStatsResponse['totalQuotationsByMonth'] =
        quotations.reduce(
          (acc, quotation) => {
            const date = new Date(quotation.created_at);
            const monthYear = `${date.getFullYear()}-${date.getMonth()}`;
            if (monthYear in acc) {
              acc[monthYear] = (acc[monthYear] || 0) + 1;
            }
            return acc;
          },
          {
            ...monthRange,
          } as DashboardStatsResponse['totalQuotationsByMonth'],
        );

      // Eventos/ventas por mes de EVENTO (aceptada + realizada). El eje
      // parte donde parte el período y se extiende hasta el último evento
      // confirmado a futuro (tramo punteado en el front). Antes esta
      // serie AGREGABA meses fuera del rango (la "fuga" que hacía que el
      // filtro pareciera no aplicar) — ahora el eje manda.
      const maxEventDate = concretadas.reduce((max, q) => {
        const d = new Date(q.event_date);
        return d > max ? d : max;
      }, new Date(end_date));
      const eventsMonthRange = generateMonthRange(start_date, maxEventDate);
      const totalQuotationsByEventDate: DashboardStatsResponse['totalQuotationsByEventDate'] =
        concretadas.reduce(
          (acc, quotation) => {
            const date = new Date(quotation.event_date);
            const monthYear = `${date.getFullYear()}-${date.getMonth()}`;
            if (monthYear in acc) {
              acc[monthYear].count += 1;
              // 24-07: SIN propina. Esta es la columna "Ventas" del
              // Dashboard y la base del margen del período.
              acc[monthYear].amount += saleWithoutTip(quotation);
            }
            return acc;
          },
          Object.fromEntries(
            Object.keys(eventsMonthRange).map((month) => [
              month,
              { count: 0, amount: 0 },
            ]),
          ) as DashboardStatsResponse['totalQuotationsByEventDate'],
        );

      // get total payments by month
      // Find the maximum due_date from all payments to include future payments
      const maxPaymentDueDate =
        payments && payments.length > 0
          ? payments.reduce((max, payment) => {
              const dueDate = new Date(payment.due_date);
              return dueDate > max ? dueDate : max;
            }, new Date(end_date))
          : end_date;

      // Generate extended month range from start_date to max(end_date, maxPaymentDueDate)
      const extendedMonthRange = generateMonthRange(
        start_date,
        maxPaymentDueDate,
      );

      const totalPaymentsByMonth: DashboardStatsResponse['totalPaymentsByMonth'] =
        payments?.reduce(
          (acc, payment) => {
            const date = new Date(payment.due_date);
            const monthYear = `${date.getFullYear()}-${date.getMonth()}`;
            if (monthYear in acc) {
              acc[monthYear] += payment.amount;
            }
            return acc;
          },
          {
            ...extendedMonthRange,
          } as DashboardStatsResponse['totalPaymentsByMonth'],
        ) || {};

      // FASE 3 (23-07): cobrado vs por cobrar por mes para la tabla de
      // ingresos. Cobrado = pagos 'pagado' (mes del paid_date si existe,
      // si no el de vencimiento); por cobrar = pendiente/vencido por mes
      // de vencimiento. Mismo eje extendido de la caja.
      const totalPaymentsDetailByMonth: DashboardStatsResponse['totalPaymentsDetailByMonth'] =
        Object.fromEntries(
          Object.keys(extendedMonthRange).map((m) => [
            m,
            { cobrado: 0, porCobrar: 0, cobros: [], deudores: [] },
          ]),
        );
      type FilaPago = {
        status: string;
        paid_date: string | null;
        due_date: string | null;
        amount: number;
        payment_transactions?: { transaction_date: string; amount?: number }[];
        quotations?: {
          quotation_number?: number;
          clients?: { name?: string } | null;
        } | null;
      };
      ((payments || []) as unknown as FilaPago[]).forEach((payment) => {
        const isPaid = payment.status === 'pagado';
        // EN QUÉ MES ENTRÓ LA PLATA (28-08). Antes: si la cuota no
        // tenía la columna vieja paid_date —lo normal hoy— se usaba el
        // VENCIMIENTO, o sea cuándo DEBÍA pagarse. Medido ese día en
        // producción: de 174 cuotas pagadas así, 55 caían en el mes
        // equivocado ($101.066.964; la peor, 410 días de desfase).
        // Ahora manda la fecha del último abono (el dato ya venía en
        // la consulta, sin usarse); paid_date queda de respaldo para
        // las 40 cuotas viejas sin abonos registrados, y el
        // vencimiento solo para lo que aún no se cobra.
        const fechaDeCobro =
          fechaDelUltimoAbono(payment.payment_transactions ?? []) ??
          payment.paid_date;
        const date = new Date(
          (isPaid && fechaDeCobro ? fechaDeCobro : payment.due_date) as string,
        );
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        if (!(key in totalPaymentsDetailByMonth)) return;
        // Quién es la cuota, para el desglose del panel (31-08).
        const quien = {
          cliente: payment.quotations?.clients?.name || '—',
          cot: payment.quotations?.quotation_number ?? 0,
        };
        if (isPaid) {
          totalPaymentsDetailByMonth[key].cobrado += payment.amount;
          totalPaymentsDetailByMonth[key].cobros.push({
            ...quien,
            monto: payment.amount,
          });
        } else {
          // LO QUE FALTA POR COBRAR, DE VERDAD (28-08, pillado por
          // Felipe): antes sumaba el monto COMPLETO de la cuota aunque
          // el cliente ya hubiera abonado parte. Su caso: la cuota de
          // Brito Pradenas ($1.623.600) figuraba entera aunque tenía
          // $800.000 abonados — el panel pedía cobrar $800 mil de más.
          // Post-Venta siempre mostró el saldo bien; ahora coinciden.
          const abonado = (payment.payment_transactions ?? []).reduce(
            (suma, t) => suma + Number((t as { amount?: number }).amount ?? 0),
            0,
          );
          const saldo = Math.max(0, payment.amount - abonado);
          totalPaymentsDetailByMonth[key].porCobrar += saldo;
          if (saldo > 0)
            totalPaymentsDetailByMonth[key].deudores.push({
              ...quien,
              monto: saldo,
            });
        }
      });

      // El desglose va por EVENTO, no por cuota (Felipe, 31-08): un
      // evento cobrado en nueve cuotas es UNA línea con todo sumado.
      const porEvento = (
        lineas: { cliente: string; cot: number; monto: number }[],
      ) => {
        const juntas = new Map<number, (typeof lineas)[number]>();
        for (const l of lineas) {
          const ya = juntas.get(l.cot);
          if (ya) ya.monto += l.monto;
          else juntas.set(l.cot, { ...l });
        }
        return [...juntas.values()];
      };
      for (const mes of Object.values(totalPaymentsDetailByMonth)) {
        mes.cobros = porEvento(mes.cobros);
        mes.deudores = porEvento(mes.deudores);
      }

      // 3. return stats
      const respuesta: DashboardStatsResponse = {
        totalQuotations,
        totalClients,
        totalQuotationsByMonth,
        totalQuotationsByStatus,
        totalQuotationsByEventDate,
        totalPaymentsByMonth,
        totalPaymentsDetailByMonth,
      };
      cachePanel.set(clavePanel, respuesta, HORA_MS);
      return respuesta;
    } catch (error) {
      this.logger.error(`Error getting dashboard stats: ${error}`);
      if (error instanceof Error) {
        throw new HttpException(
          error.message,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      throw new HttpException(
        'Error getting dashboard stats',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async getCompleteStats(
    companyId: Company['id'],
    getCompleteStatsDto: GetCompleteStatsDto,
  ): Promise<CompleteStatsResponse> {
    this.logger.info(
      `getCompleteStats with companyId ${companyId} and getCompleteStatsDto ${JSON.stringify(getCompleteStatsDto)}`,
    );

    try {
      // 1 year ago by default
      const start_date = getCompleteStatsDto.start_date
        ? new Date(getCompleteStatsDto.start_date)
        : new Date(new Date().getFullYear() - 1, 0, 1);
      const end_date = getCompleteStatsDto.end_date
        ? new Date(getCompleteStatsDto.end_date)
        : new Date();

      // FASE VELOCIDAD (28-07): memoria de 1 hora (se borra sola con
      // cualquier cambio de plata/cotizaciones) y las 9 consultas en
      // PARALELO en vez de en fila india (era el costo principal).
      const claveStats = `${companyId}:stats:${start_date.toISOString().slice(0, 10)}:${end_date.toISOString().slice(0, 10)}`;
      const statsEnMemoria = cachePanel.get(claveStats);
      if (statsEnMemoria) return statsEnMemoria as CompleteStatsResponse;

      const params = {
        p_company_id: companyId,
        p_from_date: start_date,
        p_to_date: end_date,
      };
      const CONSULTAS = [
        'get_quotation_status_stats',
        'get_event_type_conversion_stats',
        'get_event_type_revenue_stats',
        'get_revenue_by_client_type',
        'get_top_clients_by_revenue',
        'get_variable_services_usage',
        'get_fixed_services_usage',
        'get_top_clients_by_quotations',
        'get_recurring_clients',
      ] as const;
      const resultados = await Promise.all(
        CONSULTAS.map((fn) => this.supabase.client.rpc(fn, params)),
      );
      resultados.forEach((r, i) => {
        if (r.error) {
          this.logger.error(`Error en ${CONSULTAS[i]}: ${r.error.message}`);
          throw new HttpException(
            r.error.message,
            HttpStatus.INTERNAL_SERVER_ERROR,
          );
        }
      });
      const [
        quotation_status_stats,
        event_type_conversion_stats,
        event_type_revenue_stats,
        revenue_by_client_type_stats,
        top_clients_by_revenue,
        variable_services_usage,
        fixed_services_usage,
        top_clients_by_quotations,
        recurring_clients,
      ] = resultados.map((r) => r.data as unknown[]);

      // 3. return stats
      const respuestaStats = {
        quotation_status_stats: quotation_status_stats,
        event_type_conversion_stats: event_type_conversion_stats,
        event_type_revenue_stats: event_type_revenue_stats,
        revenue_by_client_type: revenue_by_client_type_stats,
        top_clients_by_revenue: top_clients_by_revenue,
        variable_services_usage: variable_services_usage,
        fixed_services_usage: fixed_services_usage,
        top_clients_by_quotations: top_clients_by_quotations,
        recurring_clients: recurring_clients,
      } as unknown as CompleteStatsResponse;
      cachePanel.set(claveStats, respuestaStats, HORA_MS);
      return respuestaStats;
    } catch (error) {
      this.logger.error(`Error getting complete stats: ${error}`);
      if (error instanceof Error) {
        throw new HttpException(
          error.message,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
      throw new HttpException(
        'Error getting complete stats',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
