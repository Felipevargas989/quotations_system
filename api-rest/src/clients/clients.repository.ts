import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
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

  // ---- Tipos de cliente (catálogo por empresa, tabla client_types) ----
  // Los tipos dejaron de ser una lista fija en el código: cada empresa
  // puede crear los suyos (ej: "Club Adulto Mayor"). Definido con
  // Felipe el 21-07-2026.

  async findTypes(companyId: number) {
    this.logger.info(`findTypes with companyId ${companyId}`);
    const { data, error } = await this.supabase.client
      .from('client_types')
      .select('id, name')
      .eq('company_id', companyId)
      .order('name');
    if (error) throw error;
    return data as { id: number; name: string }[];
  }

  async createType(companyId: number, name: string) {
    const clean = (name ?? '').trim();
    this.logger.info(`createType "${clean}" with companyId ${companyId}`);
    if (!clean) {
      throw new BadRequestException('El nombre del tipo no puede estar vacío');
    }
    // Idempotente: si ya existe (ignorando mayúsculas), se devuelve el
    // existente en vez de crear un duplicado.
    const { data: existing, error: exError } = await this.supabase.client
      .from('client_types')
      .select('id, name')
      .eq('company_id', companyId);
    if (exError) throw exError;
    const match = (existing ?? []).find(
      (t) => t.name.trim().toLowerCase() === clean.toLowerCase(),
    );
    if (match) return match;
    const { data, error } = await this.supabase.client
      .from('client_types')
      .insert([{ company_id: companyId, name: clean }])
      .select('id, name')
      .single();
    if (error) throw error;
    return data as { id: number; name: string };
  }

  async removeType(id: number, companyId: number) {
    this.logger.info(`removeType ${id} with companyId ${companyId}`);
    const { data: type, error: typeError } = await this.supabase.client
      .from('client_types')
      .select('id, name')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();
    if (typeError) throw typeError;
    // Un tipo en uso por algún cliente no puede eliminarse (misma
    // filosofía que el borrado de clientes con cotizaciones).
    const { count, error: countError } = await this.supabase.client
      .from('clients')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId)
      .eq('client_type', type.name);
    if (countError) throw countError;
    if ((count ?? 0) > 0) {
      throw new ConflictException(
        `El tipo "${type.name}" está en uso por ${count} cliente(s) y no puede eliminarse`,
      );
    }
    const { error } = await this.supabase.client
      .from('client_types')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
    return { deleted: true };
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
