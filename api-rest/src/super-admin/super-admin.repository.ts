import { Injectable } from '@nestjs/common';
import { AuthError, PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { logSafe } from '../logging/log-safe';
import { CreateSuscriptionDto } from './dto/create-suscription.dto';
import {
  QuotationDayStats,
  UserLastSignInStats,
} from './dto/quotation-stats.dto';
import { TorreBase } from './dto/torre.dto';

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
      `createSuscription with createSuscriptionDto ${logSafe(createSuscriptionDto)}`,
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

  async getUsersLastSignIns({
    startDate,
    endDate,
  }: {
    startDate: Date;
    endDate: Date;
  }): Promise<{
    data: UserLastSignInStats[] | null;
    totals: {
      total_users: number;
      total_signed_in_in_period: number;
      total_never_signed_in: number;
    };
    error: AuthError | null;
  }> {
    try {
      const rangeStart = new Date(startDate);
      rangeStart.setHours(0, 0, 0, 0);
      const rangeEnd = new Date(endDate);
      rangeEnd.setHours(23, 59, 59, 999);

      const { data, error } = await this.supabase.client.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });

      if (error) {
        this.logger.error(
          `Error fetching auth users for sign-in stats: ${error.message}`,
        );
        return {
          data: null,
          totals: {
            total_users: 0,
            total_signed_in_in_period: 0,
            total_never_signed_in: 0,
          },
          error,
        };
      }

      const users = data?.users ?? [];

      const filteredUsers: UserLastSignInStats[] = users
        .filter((user) => !!user.last_sign_in_at)
        .filter((user) => {
          const lastSignIn = user.last_sign_in_at
            ? new Date(user.last_sign_in_at)
            : null;
          if (!lastSignIn) {
            return false;
          }
          return lastSignIn >= rangeStart && lastSignIn <= rangeEnd;
        })
        .sort((a, b) => {
          const aDate = a.last_sign_in_at
            ? new Date(a.last_sign_in_at).getTime()
            : 0;
          const bDate = b.last_sign_in_at
            ? new Date(b.last_sign_in_at).getTime()
            : 0;
          return bDate - aDate;
        })
        .map((user) => ({
          id: user.id,
          email: user.email ?? null,
          last_sign_in_at: user.last_sign_in_at ?? null,
          created_at: user.created_at,
          phone: user.phone ?? null,
        }));

      const totalNeverSignedIn = users.filter(
        (user) => !user.last_sign_in_at,
      ).length;

      return {
        data: filteredUsers,
        totals: {
          total_users: users.length,
          total_signed_in_in_period: filteredUsers.length,
          total_never_signed_in: totalNeverSignedIn,
        },
        error: null,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Error in getUsersLastSignIns: ${errorMessage}`);
      return {
        data: null,
        totals: {
          total_users: 0,
          total_signed_in_in_period: 0,
          total_never_signed_in: 0,
        },
        error: error as AuthError,
      };
    }
  }

  // Torre de Control (tanda 1, 05-08): los crudos de la torre en tres
  // consultas. OJO medido en la base: el id de user_profiles NO calza
  // con auth.users.id — el cruce confiable es por EMAIL, y lo hace el
  // servicio; acá solo se trae cada lista completa.
  async getTorreBase(): Promise<TorreBase> {
    this.logger.info('getTorreBase (super-admin)');

    const { data: authData, error: authError } =
      await this.supabase.client.auth.admin.listUsers({
        page: 1,
        perPage: 1000,
      });
    if (authError) {
      this.logger.error(`getTorreBase auth error: ${authError.message}`);
      throw authError;
    }

    const { data: profiles, error: profilesError } = await this.supabase.client
      .from('user_profiles')
      .select('email, full_name, role, company_id');
    if (profilesError) {
      this.logger.error(
        `getTorreBase profiles error: ${profilesError.message}`,
      );
      throw profilesError;
    }

    const { data: companies, error: companiesError } =
      await this.supabase.client
        .from('companies')
        .select('id, name, created_at');
    if (companiesError) {
      this.logger.error(
        `getTorreBase companies error: ${companiesError.message}`,
      );
      throw companiesError;
    }

    return {
      authUsers: (authData?.users ?? []).map((u) => ({
        email: u.email ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        created_at: u.created_at ?? null,
      })),
      profiles: (profiles ?? []) as TorreBase['profiles'],
      companies: (companies ?? []) as TorreBase['companies'],
    };
  }

  // Conteo de leads; con `desdeIso` cuenta solo los del período.
  async countLeads(desdeIso?: string): Promise<number> {
    this.logger.info('countLeads (super-admin)');
    let query = this.supabase.client
      .from('leads')
      .select('id', { count: 'exact', head: true });
    if (desdeIso) query = query.gte('created_at', desdeIso);
    const { count, error } = await query;
    if (error) {
      this.logger.error(`countLeads error: ${error.message}`);
      throw error;
    }
    return count ?? 0;
  }

  // Mudanza #7 (28-07): empresas del área super-admin por el backend.
  async listCompanies() {
    this.logger.info('listCompanies (super-admin)');
    const { data, error } = await this.supabase.client
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []) as Record<string, unknown>[];
  }

  async createCompanyOnly(name: string) {
    this.logger.info('createCompanyOnly (super-admin)');
    const { data, error } = await this.supabase.client
      .from('companies')
      .insert({ name })
      .select()
      .single();
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  async updateCompanyById(id: number, fields: Record<string, unknown>) {
    this.logger.info(`updateCompanyById ${id} (super-admin)`);
    const { data, error } = await this.supabase.client
      .from('companies')
      .update(fields)
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as Record<string, unknown>;
  }

  // Mudanza #1 de "una sola puerta" (28-07): el lead de la landing se
  // inserta ACÁ con la llave de servicio, ya no directo desde el
  // navegador con la llave anónima.
  async registerLead(lead: {
    nombre: string;
    telefono: string;
    email: string;
    nombre_empresa?: string;
    personas_empresa?: string;
    ventas_anuales?: string;
  }) {
    this.logger.info('registerLead (campos personales redactados)');
    const { data, error } = await this.supabase.client
      .from('leads')
      .insert([lead])
      .select()
      .single();
    if (error) {
      this.logger.error(`registerLead error: ${error.message}`);
      throw error;
    }
    return data as { id: string };
  }
}
