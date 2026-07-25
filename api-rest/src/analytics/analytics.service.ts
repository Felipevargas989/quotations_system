import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ClientsService } from 'src/clients/clients.service';
import { Company } from 'src/companies/entities/company.entity';
import { PaymentsService } from 'src/payments/payments.service';
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
      const quotations = await this.quotationsService.findAll({
        companyId,
        request_type: RequestType.COTIZACION,
        statuses: ALL_STATUSES,
        dateRange: { start_date, end_date },
      });
      const concretadas = await this.quotationsService.findAll({
        companyId,
        request_type: RequestType.COTIZACION,
        statuses: [QuotationStatus.ACEPTADA, QuotationStatus.REALIZADA],
        eventDateFrom: start_date,
      });

      // get all clients
      const clients = await this.clientsService.findAll(companyId);

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
            { cobrado: 0, porCobrar: 0 },
          ]),
        );
      (payments || []).forEach((payment: any) => {
        const isPaid = payment.status === 'pagado';
        const date = new Date(
          isPaid && payment.paid_date ? payment.paid_date : payment.due_date,
        );
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        if (!(key in totalPaymentsDetailByMonth)) return;
        if (isPaid) {
          totalPaymentsDetailByMonth[key].cobrado += payment.amount;
        } else {
          totalPaymentsDetailByMonth[key].porCobrar += payment.amount;
        }
      });

      // 3. return stats
      return {
        totalQuotations,
        totalClients,
        totalQuotationsByMonth,
        totalQuotationsByStatus,
        totalQuotationsByEventDate,
        totalPaymentsByMonth,
        totalPaymentsDetailByMonth,
      };
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

      // get quotation status stats
      const {
        data: quotation_status_stats,
        error: quotation_status_stats_error,
      } = await this.supabase.client.rpc('get_quotation_status_stats', {
        p_company_id: companyId,
        p_from_date: start_date,
        p_to_date: end_date,
      });

      if (quotation_status_stats_error) {
        this.logger.error(
          `Error getting quotation status stats: ${quotation_status_stats_error.message}`,
        );
        throw new HttpException(
          quotation_status_stats_error.message,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // get quotation by event_type stats
      // (23-07: llevaba company 1 y el año 2025 FIJOS en el código —
      // ignoraba el filtro de fechas de la pantalla. Corregido.)
      const {
        data: event_type_conversion_stats,
        error: event_type_conversion_stats_error,
      } = await this.supabase.client.rpc('get_event_type_conversion_stats', {
        p_company_id: companyId,
        p_from_date: start_date,
        p_to_date: end_date,
      });

      if (event_type_conversion_stats_error) {
        this.logger.error(
          `Error getting event type conversion stats: ${event_type_conversion_stats_error.message}`,
        );
        throw new HttpException(
          event_type_conversion_stats_error.message,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // get event type revenue stats
      const {
        data: event_type_revenue_stats,
        error: event_type_revenue_stats_error,
      } = await this.supabase.client.rpc('get_event_type_revenue_stats', {
        p_company_id: companyId,
        p_from_date: start_date,
        p_to_date: end_date,
      });

      if (event_type_revenue_stats_error) {
        this.logger.error(
          `Error getting event type revenue stats: ${event_type_revenue_stats_error.message}`,
        );
        throw new HttpException(
          event_type_revenue_stats_error.message,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // get revenue by client type stats
      const {
        data: revenue_by_client_type_stats,
        error: revenue_by_client_type_stats_error,
      } = await this.supabase.client.rpc('get_revenue_by_client_type', {
        p_company_id: companyId,
        p_from_date: start_date,
        p_to_date: end_date,
      });

      if (revenue_by_client_type_stats_error) {
        this.logger.error(
          `Error getting revenue by client type stats: ${revenue_by_client_type_stats_error.message}`,
        );
        throw new HttpException(
          revenue_by_client_type_stats_error.message,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // get top 10 clients by revenue
      const {
        data: top_clients_by_revenue,
        error: top_clients_by_revenue_error,
      } = await this.supabase.client.rpc('get_top_clients_by_revenue', {
        p_company_id: companyId,
        p_from_date: start_date,
        p_to_date: end_date,
      });

      if (top_clients_by_revenue_error) {
        this.logger.error(
          `Error getting top clients by revenue: ${top_clients_by_revenue_error.message}`,
        );
        throw new HttpException(
          top_clients_by_revenue_error.message,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // get variable service stats get_variable_services_usage
      const {
        data: variable_services_usage,
        error: variable_services_usage_error,
      } = await this.supabase.client.rpc('get_variable_services_usage', {
        p_company_id: companyId,
        p_from_date: start_date,
        p_to_date: end_date,
      });

      if (variable_services_usage_error) {
        this.logger.error(
          `Error getting variable services usage: ${variable_services_usage_error.message}`,
        );
        throw new HttpException(
          variable_services_usage_error.message,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // get fixed services usage
      const { data: fixed_services_usage, error: fixed_services_usage_error } =
        await this.supabase.client.rpc('get_fixed_services_usage', {
          p_company_id: companyId,
          p_from_date: start_date,
          p_to_date: end_date,
        });

      if (fixed_services_usage_error) {
        this.logger.error(
          `Error getting fixed services usage: ${fixed_services_usage_error.message}`,
        );
        throw new HttpException(
          fixed_services_usage_error.message,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Análisis de cartera (23-07): top por N° de cotizaciones y
      // clientes recurrentes (2+ eventos concretados en el período).
      const {
        data: top_clients_by_quotations,
        error: top_clients_by_quotations_error,
      } = await this.supabase.client.rpc('get_top_clients_by_quotations', {
        p_company_id: companyId,
        p_from_date: start_date,
        p_to_date: end_date,
      });

      if (top_clients_by_quotations_error) {
        this.logger.error(
          `Error getting top clients by quotations: ${top_clients_by_quotations_error.message}`,
        );
        throw new HttpException(
          top_clients_by_quotations_error.message,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      const { data: recurring_clients, error: recurring_clients_error } =
        await this.supabase.client.rpc('get_recurring_clients', {
          p_company_id: companyId,
          p_from_date: start_date,
          p_to_date: end_date,
        });

      if (recurring_clients_error) {
        this.logger.error(
          `Error getting recurring clients: ${recurring_clients_error.message}`,
        );
        throw new HttpException(
          recurring_clients_error.message,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // 3. return stats
      return {
        quotation_status_stats: quotation_status_stats,
        event_type_conversion_stats: event_type_conversion_stats,
        event_type_revenue_stats: event_type_revenue_stats,
        revenue_by_client_type: revenue_by_client_type_stats,
        top_clients_by_revenue: top_clients_by_revenue,
        variable_services_usage: variable_services_usage,
        fixed_services_usage: fixed_services_usage,
        top_clients_by_quotations: top_clients_by_quotations,
        recurring_clients: recurring_clients,
      };
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
