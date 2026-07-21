import { ConflictException, Injectable } from '@nestjs/common';
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
    // quotations(id) embeds only the ids of linked quotations, so the
    // frontend can know how many exist (a client with quotations must
    // not be deletable) without loading the heavy quotation payloads.
    const { data, error } = await this.supabase.client
      .from('clients')
      .select('*, quotations(id)')
      .eq('company_id', companyId)
      .order('name');
    if (error) throw error;
    return (data as unknown as (Client & { quotations?: { id: string }[] })[]).map(
      ({ quotations, ...client }) => ({
        ...client,
        quotation_count: quotations?.length ?? 0,
      }),
    ) as unknown as Client[];
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

  async remove(id: string, companyId: number) {
    this.logger.info(`remove client with id ${id}`);
    // A client with linked quotations must never be deleted (the DB
    // foreign key also blocks it, but this returns a clear message
    // instead of a raw constraint error).
    const { count, error: countError } = await this.supabase.client
      .from('quotations')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', id)
      .eq('company_id', companyId);
    if (countError) throw countError;
    if ((count ?? 0) > 0) {
      throw new ConflictException(
        'El cliente tiene cotizaciones asociadas y no puede eliminarse',
      );
    }
    const { data, error } = await this.supabase.client
      .from('clients')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)
      .select()
      .single();
    if (error) throw error;
    return data as unknown as Client;
  }

  findOne(company_id: number, id?: number, email?: string, phone?: string) {
    this.logger.info(
      `findOne client with company_id ${company_id} and id ${id} and email ${email} and phone ${phone}`,
    );
    // Start with base query
    let query = this.supabase.client
      .from('clients')
      .select('*')
      .eq('company_id', company_id);

    // Add filters only if provided
    if (id !== undefined) query = query.eq('id', id);
    if (email !== undefined) query = query.eq('email', email);
    if (phone !== undefined) query = query.eq('phone', phone);

    // Execute
    return query.single();
  }
}
