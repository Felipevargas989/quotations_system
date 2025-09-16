import { Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
import { RequestType } from './constants/constants';
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

  async findAll(
    company_id: Company['id'],
    request_type?: RequestType,
    sort_by?: string,
    sort_order?: 'asc' | 'desc',
  ): Promise<Quotation[]> {
    this.logger.info(`findAll quotations with company_id ${company_id}`);
    const query = this.supabase.client
      .from('quotations')
      .select('*')
      .eq('company_id', company_id);
    if (request_type) {
      query.eq('request_type', request_type);
    }

    if (sort_by) {
      query.order(sort_by, { ascending: sort_order === 'asc' });
    }

    const { data, error } = await query;
    if (error) throw error;
    return data as Quotation[];
  }

  async findOne(id: string): Promise<{
    data: Quotation | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(`find quotation with id ${id}`);
    return await this.supabase.client
      .from('quotations')
      .select('*')
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
