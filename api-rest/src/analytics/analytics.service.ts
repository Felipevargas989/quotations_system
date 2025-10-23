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

      // 1. get all quotations
      // TODO: check if add requirmenents
      const quotations = await this.quotationsService.findAll({
        companyId,
        request_type: RequestType.COTIZACION,
        statuses: [
          QuotationStatus.SOLICITADA,
          QuotationStatus.ENVIADA,
          QuotationStatus.EN_NEGOCIACION,
          QuotationStatus.ACEPTADA,
          QuotationStatus.RECHAZADA,
        ],
      });

      // get all clients
      const clients = await this.clientsService.findAll(companyId);

      // get all payments
      // get all quotations_ids
      const quotations_ids = quotations.map((quotation) => quotation.id);

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

            acc[status].amount += quotation.total_amount;
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

      // get quotations by event_date (only accepted quotations)
      const totalQuotationsByEventDate: DashboardStatsResponse['totalQuotationsByEventDate'] =
        quotations.reduce(
          (acc, quotation) => {
            // Only count accepted quotations for events
            if (quotation.quotation_status === QuotationStatus.ACEPTADA) {
              const date = new Date(quotation.event_date);
              const monthYear = `${date.getFullYear()}-${date.getMonth()}`;
              if (!(monthYear in acc)) {
                acc[monthYear] = { count: 0, amount: 0 };
              }
              acc[monthYear].count += 1;
              acc[monthYear].amount += quotation.total_amount;
            }
            return acc;
          },
          Object.fromEntries(
            Object.keys(monthRange).map((month) => [
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

      // 3. return stats
      return {
        totalQuotations,
        totalClients,
        totalQuotationsByMonth,
        totalQuotationsByStatus,
        totalQuotationsByEventDate,
        totalPaymentsByMonth,
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
      const {
        data: event_type_conversion_stats,
        error: event_type_conversion_stats_error,
      } = await this.supabase.client.rpc('get_event_type_conversion_stats', {
        p_company_id: 1,
        p_from_date: '2025-01-01',
        p_to_date: '2025-12-31',
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
      return {
        quotation_status_stats: quotation_status_stats,
        event_type_conversion_stats: event_type_conversion_stats,
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
