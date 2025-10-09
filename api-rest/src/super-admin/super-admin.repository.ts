import { Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { CreateSuscriptionDto } from './dto/create-suscription.dto';
import { QuotationDayStats } from './dto/quotation-stats.dto';

@Injectable()
export class SuperAdminRepository {
  constructor(
    private readonly logger: PinoLogger,
    private readonly supabase: SupabaseService,
  ) {
    this.logger.setContext(SuperAdminRepository.name);
  }

  createSuscription(createSuscriptionDto: CreateSuscriptionDto) {
    this.logger.info(
      `createSuscription with createSuscriptionDto ${JSON.stringify(createSuscriptionDto)}`,
    );
  }

  async getStatsLastMonth(): Promise<{
    data:
      | {
          company_id: number;
          company_name: string;
          stats: QuotationDayStats[];
          total_quotations: number;
          total_amount: number;
        }[]
      | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(`getStatsLastMonth for all companies`);

    try {
      // Get the date range for last 30 days
      const now = new Date();
      const endDate = now.toISOString().split('T')[0]; // Today

      // Calculate 30 days ago
      const thirtyDaysAgo = new Date(now);
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const startDate = thirtyDaysAgo.toISOString().split('T')[0];

      this.logger.info(`Querying quotations from ${startDate} to ${endDate}`);

      // Get all companies first
      const { data: companies, error: companiesError } =
        await this.supabase.client
          .from('companies')
          .select('id, name')
          .order('id', { ascending: true });

      if (companiesError) {
        this.logger.error(
          `Error fetching companies: ${companiesError.message}`,
        );
        return { data: null, error: companiesError };
      }

      if (!companies || companies.length === 0) {
        this.logger.info('No companies found');
        return { data: [], error: null };
      }

      // Get quotations for all companies in the date range
      const { data: quotationsData, error: quotationsError } =
        await this.supabase.client
          .from('quotations')
          .select('created_at, company_id, total_amount')
          .gte('created_at', `${startDate}T00:00:00.000Z`)
          .lte('created_at', `${endDate}T23:59:59.999Z`)
          .order('created_at', { ascending: true });

      if (quotationsError) {
        this.logger.error(
          `Error in quotations query: ${quotationsError.message}`,
        );
        return { data: null, error: quotationsError };
      }

      // Process data for each company
      const result = companies.map((company) => {
        // Filter quotations for this company
        const companyQuotations =
          quotationsData?.filter((q) => q.company_id === company.id) || [];

        // Group by day and count/sum amounts for this company
        const dayStats = new Map<
          string,
          { count: number; total_amount: number }
        >();

        companyQuotations.forEach((quotation) => {
          const date = new Date(quotation.created_at)
            .toISOString()
            .split('T')[0];
          const current = dayStats.get(date) || { count: 0, total_amount: 0 };
          dayStats.set(date, {
            count: current.count + 1,
            total_amount: current.total_amount + (quotation.total_amount || 0),
          });
        });

        // Convert to array format and fill missing days with 0
        const stats: QuotationDayStats[] = [];
        const currentDate = new Date(thirtyDaysAgo);

        while (currentDate <= now) {
          const dateStr = currentDate.toISOString().split('T')[0];
          const dayStat = dayStats.get(dateStr) || {
            count: 0,
            total_amount: 0,
          };
          stats.push({
            date: dateStr,
            count: dayStat.count,
            total_amount: dayStat.total_amount,
          });
          currentDate.setDate(currentDate.getDate() + 1);
        }

        // Calculate total quotations and total amount for this company
        const total_quotations = companyQuotations.length;
        const total_amount = companyQuotations.reduce(
          (sum, q) => sum + ((q.total_amount as number) || 0),
          0,
        );

        return {
          company_id: company.id,
          company_name: company.name,
          stats,
          total_quotations,
          total_amount,
        };
      });

      return { data: result, error: null };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error in getStatsLastMonth: ${errorMessage}`);
      return { data: null, error: error as PostgrestError };
    }
  }
}
