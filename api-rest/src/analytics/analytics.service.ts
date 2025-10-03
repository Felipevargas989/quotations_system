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
import { DashboardStatsResponse } from './types';
import { generateMonthRange } from './utils';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly quotationsService: QuotationsService,
    private readonly clientsService: ClientsService,
    private readonly paymentsService: PaymentsService,
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
      const quotations = await this.quotationsService.findAll(
        companyId,
        RequestType.COTIZACION,
        [
          QuotationStatus.SOLICITADA,
          QuotationStatus.ENVIADA,
          QuotationStatus.EN_NEGOCIACION,
          QuotationStatus.ACEPTADA,
          QuotationStatus.RECHAZADA,
        ],
        {
          start_date,
          end_date,
        },
      );

      // get all clients
      const clients = await this.clientsService.findAll(companyId);

      // get all payments
      // TODO: add filter by quotation_id in the payments service
      const payments =
        await this.paymentsService.findAllPaymentsWithTransactions(companyId);

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
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
            acc[status].count += 1;
            // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
      const totalPaymentsByMonth: DashboardStatsResponse['totalPaymentsByMonth'] =
        payments.reduce(
          (acc, payment) => {
            const date = new Date(payment.due_date);
            const monthYear = `${date.getFullYear()}-${date.getMonth()}`;
            if (monthYear in acc) {
              acc[monthYear] += payment.paid_amount;
            }
            return acc;
          },
          {
            ...monthRange,
          } as DashboardStatsResponse['totalPaymentsByMonth'],
        );

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
}
