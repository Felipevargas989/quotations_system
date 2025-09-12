import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { Client } from './entities/client.entity';
import { CreateClient, UpdateClient } from './interfaces/clients.interfaces';

@Injectable()
export class ClientsRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ClientsRepository.name);
  }

  async create(client: CreateClient) {
    this.logger.info(
      `create client with client params ${JSON.stringify(client)}`,
    );
    const { data, error } = await this.supabase.client
      .from('clients')
      .insert([client])
      .select()
      .single();
    if (error) throw error;
    return data as unknown as Client;
  }

  async findAll(companyId: number) {
    this.logger.info(`findAll clients with companyId ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('clients')
      .select('*')
      .eq('company_id', companyId)
      .order('name');
    if (error) throw error;
    return data as unknown as Client[];
  }

  async update(id: string, updateClient: UpdateClient, companyId: number) {
    this.logger.info(
      `update client with id ${id} and updateClient ${JSON.stringify(updateClient)}`,
    );
    const { data, error } = await this.supabase.client
      .from('clients')
      .update(updateClient)
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as Client;
  }
}
