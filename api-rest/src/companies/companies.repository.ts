import { Injectable } from '@nestjs/common';
import { PostgrestError } from '@supabase/supabase-js';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { UpdateCompanyDto } from './dto/update-company.dto';
import { Company } from './entities/company.entity';

@Injectable()
export class CompaniesRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CompaniesRepository.name);
  }

  async create(company: Omit<Company, 'id'>): Promise<{
    data: Company | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(
      `create company with company params ${JSON.stringify(company)}`,
    );
    return await this.supabase.client
      .from('companies')
      .insert([company])
      .select()
      .single();
  }

  /**
   * Borra UNA empresa por id. Existe para un solo uso (16-09-2026): la
   * compensación del alta pública. Si la empresa se creó pero su usuario
   * administrador no pudo crearse (correo repetido, contraseña corta),
   * la empresa recién nacida se borra para no dejar huérfanas — cada
   * reintento del visitante crearía otra.
   */
  async deleteById(id: Company['id']): Promise<{ error: unknown }> {
    this.logger.info(`deleteById company ${id}`);
    const { error } = await this.supabase.client
      .from('companies')
      .delete()
      .eq('id', id);
    return { error };
  }

  async findOne(id: Company['id']): Promise<{
    data: Company | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(`findOne company with id ${id}`);
    return await this.supabase.client
      .from('companies')
      .select('*')
      .eq('id', id)
      .single();
  }

  async update(
    id: Company['id'],
    updateCompanyDto: UpdateCompanyDto,
  ): Promise<{
    data: Company | null;
    error: PostgrestError | null;
  }> {
    this.logger.info(
      `update company with id ${id} and updateCompanyDto ${JSON.stringify(updateCompanyDto)}`,
    );
    return await this.supabase.client
      .from('companies')
      .update(updateCompanyDto)
      .eq('id', id)
      .select()
      .single();
  }
}
