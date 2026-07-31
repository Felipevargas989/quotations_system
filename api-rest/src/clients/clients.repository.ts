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
    // quotations(id, quotation_status) embeds only ids + statuses of the
    // linked quotations, so the frontend can know how many exist (a client
    // with quotations must not be deletable) and segment the client book
    // (efectivos / cotizaron sin concretar / en proceso / sin cotizaciones)
    // without loading the heavy quotation payloads.
    const { data, error } = await this.supabase.client
      .from('clients')
      .select(
        '*, quotations(id, quotation_status), client_contacts(id, name, email, phone, is_primary)',
      )
      .eq('company_id', companyId)
      .order('name');
    if (error) throw error;
    return (
      data as unknown as (Client & {
        quotations?: { id: string; quotation_status: string }[];
      })[]
    ).map(({ quotations, ...client }) => ({
      ...client,
      quotation_count: quotations?.length ?? 0,
      quotation_statuses: (quotations || []).map((q) => q.quotation_status),
    })) as unknown as Client[];
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
    // Orden manual de la empresa (flechas ↑↓ en "Gestionar tipos");
    // los sin orden asignado van al final, alfabéticamente.
    const { data, error } = await this.supabase.client
      .from('client_types')
      .select('id, name, sort_order')
      .eq('company_id', companyId)
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('name');
    if (error) throw error;
    return data as { id: number; name: string; sort_order: number | null }[];
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
      .select('id, name, sort_order')
      .eq('company_id', companyId);
    if (exError) throw exError;
    type TipoCliente = { id: number; name: string; sort_order: number | null };
    const match = ((existing ?? []) as TipoCliente[]).find(
      (t) => t.name.trim().toLowerCase() === clean.toLowerCase(),
    );
    if (match) return match;
    // El tipo nuevo entra al final del orden manual.
    const nextOrder =
      Math.max(
        0,
        ...((existing ?? []) as TipoCliente[]).map((t) => t.sort_order ?? 0),
      ) + 1;
    const { data, error } = await this.supabase.client
      .from('client_types')
      .insert([{ company_id: companyId, name: clean, sort_order: nextOrder }])
      .select('id, name, sort_order')
      .single();
    if (error) throw error;
    return data as { id: number; name: string; sort_order: number };
  }

  // Reordenar tipos: recibe los ids en el orden final y persiste 1..N.
  async reorderTypes(companyId: number, ids: number[]) {
    this.logger.info(
      `reorderTypes companyId ${companyId} ids ${ids.join(',')}`,
    );
    const { data: own, error: ownError } = await this.supabase.client
      .from('client_types')
      .select('id')
      .eq('company_id', companyId);
    if (ownError) throw ownError;
    const ownIds = new Set(((own ?? []) as { id: number }[]).map((t) => t.id));
    const valid = ids.filter((i) => ownIds.has(i));
    for (let i = 0; i < valid.length; i++) {
      const { error } = await this.supabase.client
        .from('client_types')
        .update({ sort_order: i + 1 })
        .eq('id', valid[i])
        .eq('company_id', companyId);
      if (error) throw error;
    }
    return this.findTypes(companyId);
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

  // Resumen comercial del cliente (ficha 360°, definido con Felipe el
  // 21-07-2026): ficha + contactos + cotizaciones + cuotas impagas +
  // encuestas de satisfacción, todo en una sola llamada.
  async findSummary(id: string, companyId: number) {
    this.logger.info(`findSummary client ${id} companyId ${companyId}`);
    const { data: client, error: clientError } = await this.supabase.client
      .from('clients')
      .select('*, client_contacts(id, name, email, phone, is_primary)')
      .eq('id', id)
      .eq('company_id', companyId)
      .single();
    if (clientError) throw clientError;

    const { data: quotations, error: qError } = await this.supabase.client
      .from('quotations')
      .select(
        'id, quotation_number, quotation_status, event_type, event_date, total_amount, people_count, children_count, contact_name, created_at',
      )
      .eq('client_id', id)
      .eq('company_id', companyId)
      .order('event_date', { ascending: false });
    if (qError) throw qError;

    const qIds = ((quotations ?? []) as { id: string }[]).map((q) => q.id);
    let pendingPayments: {
      quotation_id: string;
      amount: number;
      status: string;
    }[] = [];
    let surveys: { quotation_id: string; answers: unknown }[] = [];
    if (qIds.length) {
      // Cuotas impagas (pendiente/vencido) = saldo vivo del cliente.
      const { data: cuotas, error: pError } = await this.supabase.client
        .from('payments')
        .select('quotation_id, amount, status')
        .in('quotation_id', qIds)
        .in('status', ['pendiente', 'vencido']);
      if (pError) throw pError;
      pendingPayments = cuotas ?? [];

      const { data: responses, error: sError } = await this.supabase.client
        .from('customer_satisfaction_survey_responses')
        .select('quotation_id, answers')
        .in('quotation_id', qIds);
      if (sError) throw sError;
      surveys = responses ?? [];
    }

    return {
      client,
      quotations: quotations ?? [],
      pendingPayments,
      surveys,
    };
  }

  // Match ROBUSTO para el formulario público (anti-duplicados, 22-07):
  // correo sin mayúsculas/espacios O teléfono comparado solo por dígitos
  // (los últimos 9) — "9 1234 5678", "+56912345678" y "912345678" son la
  // misma persona. Devuelve el primer cliente que calce, o null.
  async findMatch(
    company_id: number,
    email?: string,
    phone?: string,
  ): Promise<Client | null> {
    const normEmail = email?.trim().toLowerCase() || '';
    const digits = (v?: string | null) => (v || '').replace(/\D/g, '');
    const normPhone = digits(phone).slice(-9);
    if (!normEmail && !normPhone) return null;
    const { data } = await this.supabase.client
      .from('clients')
      .select('*')
      .eq('company_id', company_id);
    const rows = (data || []) as Client[];
    const porFicha = rows.find(
      (c) =>
        (normEmail && (c.email || '').trim().toLowerCase() === normEmail) ||
        (normPhone.length >= 8 && digits(c.phone).slice(-9) === normPhone),
    );
    if (porFicha) return porFicha;

    // Fuente de verdad = las PERSONAS (31-07): el calce también se
    // busca en sus correos/teléfonos — el espejo de la ficha quedó
    // jubilado y los clientes nuevos solo tienen datos en la persona.
    const { data: personas } = await this.supabase.client
      .from('client_contacts')
      .select('client_id, email, phone')
      .eq('company_id', company_id);
    const match = (
      (personas || []) as {
        client_id: string;
        email: string | null;
        phone: string | null;
      }[]
    ).find(
      (p) =>
        (normEmail && (p.email || '').trim().toLowerCase() === normEmail) ||
        (normPhone.length >= 8 && digits(p.phone).slice(-9) === normPhone),
    );
    if (!match) return null;
    return rows.find((c) => c.id === match.client_id) || null;
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
