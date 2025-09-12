import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { Company } from 'src/companies/entities/company.entity';
import { SupabaseService } from 'src/supabase/supabase.service';
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

  async findAll(company_id: Company['id']): Promise<Quotation[]> {
    this.logger.info(`findAll quotations with company_id ${company_id}`);
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select('*')
      .eq('company_id', company_id);
    if (error) throw error;
    return data as Quotation[];
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
}
