import { Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { Client } from 'src/clients/entities/client.entity';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import { QuotationStatus, RequestType } from './constants/constants';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { Quotation } from './entities/quotation.entity';
import { CreateQuotation } from './interfaces/quotations.interface';

@Injectable()
export class QuotationsRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(QuotationsRepository.name);
  }

  async findAll({
    company_id,
    request_type,
    statuses,
    sort_by,
    sort_order,
    event_date,
    dateRange,
  }: {
    company_id: Company['id'] | undefined;
    request_type?: RequestType;
    statuses?: QuotationStatus[];
    sort_by?: string;
    sort_order?: 'asc' | 'desc';
    event_date?: string;
    dateRange?: { start_date: Date; end_date: Date };
  }): Promise<Quotation[]> {
    this.logger.info(`findAll quotations with company_id ${company_id}`);
    const query = this.supabase.client.from('quotations').select(
      `*,
        clients (
          id,
          name
        )
        `,
    );
    if (company_id) {
      query.eq('company_id', company_id);
    }
    if (request_type) {
      query.eq('request_type', request_type);
    }

    if (sort_by) {
      query.order(sort_by, { ascending: sort_order === 'asc' });
    }

    if (statuses) {
      query.in('quotation_status', statuses);
    }

    if (event_date) {
      query.eq('event_date', event_date);
    }

    if (dateRange) {
      query.gte('created_at', dateRange.start_date.toISOString());
      query.lte('created_at', dateRange.end_date.toISOString());
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Quotation[];
  }

  async findOne(id: string): Promise<{
    data:
      | (Quotation & { clients: Pick<Client, 'name' | 'email'> } & {
          companies: Pick<Company, 'name'>;
        })
      | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(`find quotation with id ${id}`);
    return await this.supabase.client
      .from('quotations')
      .select(
        `*,
        clients (
          name,
          email
        ),
        companies (
          name
        )
        `,
      )
      .eq('id', id)
      .single();
  }

  async create(createQuotation: CreateQuotation) {
    this.logger.info(
      `create quotation with createQuotationDto ${JSON.stringify(createQuotation)}`,
    );
    const { data, error } = await this.supabase.client
      .from('quotations')
      .insert([createQuotation])
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data as Quotation;
  }

  async update(
    id: string,
    updateQuotationDto: UpdateQuotationDto,
    companyId: number,
  ): Promise<Quotation> {
    this.logger.info(
      `update quotation with id ${id} and updateQuotationDto ${JSON.stringify(updateQuotationDto)}`,
    );
    const { data, error } = await this.supabase.client
      .from('quotations')
      .update(updateQuotationDto)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();
    if (error) {
      throw error;
    }
    return data as Quotation;
  }

  async remove(id: string, companyId: number) {
    this.logger.info(
      `remove quotation with id ${id} and companyId ${companyId}`,
    );
    const { data, error } = await this.supabase.client
      .from('quotations')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) {
      throw error;
    }
    return data as unknown as Quotation;
  }
}
