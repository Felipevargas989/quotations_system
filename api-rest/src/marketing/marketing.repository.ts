import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';

export interface ContactoMarketing {
  id: number;
  company_id: number;
  audiencia: string;
  email: string;
  name: string | null;
  empresa: string | null;
}

export interface CampanaMarketing {
  id: number;
  company_id: number;
  nombre: string;
  asunto: string;
  titulo: string;
  cuerpo: string;
  preencabezado: string | null;
  audiencia_tipo: 'clientes' | 'importada' | 'segmento';
  audiencia_id: number | null;
  audiencia_ref: string | null;
  tipos_cliente: string[] | null;
  filtro: Record<string, unknown> | null;
  estado: 'borrador' | 'enviada';
  prueba_enviada_at: string | null;
  enviada_at: string | null;
  total_destinatarios: number | null;
  reenviada_con_asunto: string | null;
  created_at: string;
}

/** La audiencia guardada: nombre + filtro (la pregunta, no la lista). */
export interface AudienciaGuardada {
  id: number;
  company_id: number;
  nombre: string;
  filtro: Record<string, unknown>;
  created_at: string;
}

@Injectable()
export class MarketingRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(MarketingRepository.name);
  }

  /** Supabase corta en 1000 filas por consulta (lección ya pagada en
   *  super-admin y backup): TODA lectura sin tope conocido se pagina.
   *  Sin esto, al cruzar las 1000 filas los conteos y los envíos
   *  quedarían silenciosamente cortos (revisión 26-08). */
  private async todas<T>(
    consulta: (
      desde: number,
      hasta: number,
    ) => PromiseLike<{ data: unknown; error: unknown }>,
  ): Promise<T[]> {
    const PAGINA = 1000;
    const filas: T[] = [];
    for (let desde = 0; ; desde += PAGINA) {
      const { data, error } = await consulta(desde, desde + PAGINA - 1);
      if (error) throw new Error((error as { message?: string }).message);
      const lote = (data ?? []) as T[];
      filas.push(...lote);
      if (lote.length < PAGINA) break;
    }
    return filas;
  }

  async importarContactos(
    rows: Record<string, unknown>[],
  ): Promise<{ insertados: number }> {
    if (rows.length === 0) return { insertados: 0 };
    // upsert por (company, audiencia, correo): re-importar no duplica.
    const { error } = await this.supabase.client
      .from('marketing_contacts')
      .upsert(rows, { onConflict: 'company_id,audiencia,email' });
    if (error) throw error;
    return { insertados: rows.length };
  }

  /** Crudo audiencia+correo: el servicio descuenta las bajas. */
  async contactosImportados(companyId: number) {
    return this.todas<{ audiencia: string; email: string }>((d, h) =>
      this.supabase.client
        .from('marketing_contacts')
        .select('audiencia, email')
        .eq('company_id', companyId)
        .range(d, h),
    );
  }

  // ---- Audiencias guardadas (consulta viva con nombre) ----
  async crearAudiencia(row: {
    company_id: number;
    nombre: string;
    filtro: Record<string, unknown>;
  }): Promise<AudienciaGuardada> {
    const { data, error } = await this.supabase.client
      .from('marketing_audiences')
      .insert([row])
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as AudienciaGuardada;
  }

  async audienciasGuardadas(companyId: number): Promise<AudienciaGuardada[]> {
    const { data, error } = await this.supabase.client
      .from('marketing_audiences')
      .select('*')
      .eq('company_id', companyId)
      .order('nombre', { ascending: true });
    if (error) throw error;
    return (data ?? []) as unknown as AudienciaGuardada[];
  }

  async audienciaGuardada(
    id: number,
    companyId: number,
  ): Promise<AudienciaGuardada | null> {
    const { data, error } = await this.supabase.client
      .from('marketing_audiences')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as AudienciaGuardada | null;
  }

  async borrarAudiencia(id: number, companyId: number) {
    const { error } = await this.supabase.client
      .from('marketing_audiences')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
  }

  async contactosDeAudiencia(companyId: number, audiencia: string) {
    return this.todas<{
      email: string;
      name: string | null;
      empresa: string | null;
    }>((d, h) =>
      this.supabase.client
        .from('marketing_contacts')
        .select('email, name, empresa')
        .eq('company_id', companyId)
        .eq('audiencia', audiencia)
        .range(d, h),
    );
  }

  /** La audiencia dinámica: clientes por tipo, solo con correo. */
  async clientesPorTipo(companyId: number, tipos: string[]) {
    const { data, error } = await this.supabase.client
      .from('clients')
      .select('email, name, client_type')
      .eq('company_id', companyId)
      .in('client_type', tipos)
      .not('email', 'is', null)
      .neq('email', '');
    if (error) throw error;
    return (data as { email: string; name: string; client_type: string }[]).map(
      (c) => ({ email: c.email, name: c.name, empresa: c.name }),
    );
  }

  async tiposDeCliente(companyId: number) {
    const { data, error } = await this.supabase.client
      .from('clients')
      .select('client_type, email')
      .eq('company_id', companyId);
    if (error) throw error;
    const conteo = new Map<string, { total: number; conCorreo: number }>();
    for (const c of (data ?? []) as {
      client_type: string;
      email: string | null;
    }[]) {
      const t = c.client_type || 'Sin tipo';
      const cur = conteo.get(t) ?? { total: 0, conCorreo: 0 };
      cur.total += 1;
      if (c.email && c.email.trim()) cur.conCorreo += 1;
      conteo.set(t, cur);
    }
    return [...conteo.entries()]
      .map(([tipo, c]) => ({ tipo, ...c }))
      .sort((a, b) => b.conCorreo - a.conCorreo);
  }

  /** La materia prima del segmento (Fase 3): clientes y cotizaciones. */
  async clientesSegmentables(companyId: number) {
    return this.todas<{
      id: number;
      name: string;
      email: string | null;
      client_type: string | null;
      contact_person: string | null;
    }>((d, h) =>
      this.supabase.client
        .from('clients')
        .select('id, name, email, client_type, contact_person')
        .eq('company_id', companyId)
        .range(d, h),
    );
  }

  /** Las PERSONAS de las fichas (client_contacts) con correo: a ellas
   *  se les escribe cuando la audiencia viene de la base (26-08). */
  async contactosDeClientes(companyId: number) {
    return this.todas<{
      client_id: number;
      name: string | null;
      email: string;
    }>((d, h) =>
      this.supabase.client
        .from('client_contacts')
        .select('client_id, name, email')
        .eq('company_id', companyId)
        .not('email', 'is', null)
        .neq('email', '')
        .range(d, h),
    );
  }

  async cotizacionesSegmentables(companyId: number) {
    return this.todas<{
      client_id: number | null;
      quotation_status: string;
      event_date: string | null;
      total_amount: number | null;
      event_type: string | null;
      created_at: string;
    }>((d, h) =>
      this.supabase.client
        .from('quotations')
        .select(
          'client_id, quotation_status, event_date, total_amount, event_type, created_at',
        )
        .eq('company_id', companyId)
        .range(d, h),
    );
  }

  async tiposDeEvento(companyId: number) {
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select('event_type')
      .eq('company_id', companyId)
      .not('event_type', 'is', null);
    if (error) throw error;
    const conteo = new Map<string, number>();
    for (const q of (data ?? []) as { event_type: string }[]) {
      if (!q.event_type) continue;
      conteo.set(q.event_type, (conteo.get(q.event_type) ?? 0) + 1);
    }
    return [...conteo.entries()]
      .map(([tipo, n]) => ({ tipo, n }))
      .sort((a, b) => b.n - a.n);
  }

  // ---- Fase 2: resultados y reenvío ----
  async marcarEvento(
    resendId: string,
    cambios: Record<string, unknown>,
  ): Promise<{ company_id: number; email: string } | null> {
    const { data, error } = await this.supabase.client
      .from('marketing_sends')
      .update(cambios)
      .eq('resend_id', resendId)
      .select('company_id, email')
      .maybeSingle();
    if (error) throw error;
    return data as { company_id: number; email: string } | null;
  }

  async resultadosDe(campaignId: number, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('marketing_sends')
      .select('estado, opened_at, clicked_at, bounced_at, reenviado_at')
      .eq('campaign_id', campaignId)
      .eq('company_id', companyId);
    if (error) throw error;
    const filas = (data ?? []) as {
      estado: string;
      opened_at: string | null;
      clicked_at: string | null;
      bounced_at: string | null;
      reenviado_at: string | null;
    }[];
    return {
      enviados: filas.filter((f) => f.estado === 'enviado').length,
      abiertos: filas.filter((f) => f.opened_at).length,
      clicks: filas.filter((f) => f.clicked_at).length,
      rebotes: filas.filter((f) => f.bounced_at).length,
      reenviados: filas.filter((f) => f.reenviado_at).length,
    };
  }

  /** Los que NO abrieron y aún no reciben la segunda pasada. */
  async sinAbrirDe(campaignId: number, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('marketing_sends')
      .select('id, email, name, empresa')
      .eq('campaign_id', campaignId)
      .eq('company_id', companyId)
      .eq('estado', 'enviado')
      .is('opened_at', null)
      .is('bounced_at', null)
      .is('reenviado_at', null);
    if (error) throw error;
    return data as {
      id: number;
      email: string;
      name: string | null;
      empresa: string | null;
    }[];
  }

  async marcarReenviados(ids: number[]) {
    if (ids.length === 0) return;
    const { error } = await this.supabase.client
      .from('marketing_sends')
      .update({ reenviado_at: new Date().toISOString() })
      .in('id', ids);
    if (error) throw error;
  }

  async suprimidos(companyId: number): Promise<Set<string>> {
    const { data, error } = await this.supabase.client
      .from('marketing_suppressions')
      .select('email')
      .eq('company_id', companyId);
    if (error) throw error;
    return new Set(
      ((data ?? []) as { email: string }[]).map((s) => s.email.toLowerCase()),
    );
  }

  async suprimir(companyId: number, email: string, motivo: 'baja' | 'rebote') {
    const { error } = await this.supabase.client
      .from('marketing_suppressions')
      .upsert([{ company_id: companyId, email: email.toLowerCase(), motivo }], {
        onConflict: 'company_id,email',
        ignoreDuplicates: true,
      });
    if (error) throw error;
  }

  async crearCampana(row: Record<string, unknown>) {
    const { data, error } = await this.supabase.client
      .from('marketing_campaigns')
      .insert([row])
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as CampanaMarketing;
  }

  async campanas(companyId: number) {
    const { data, error } = await this.supabase.client
      .from('marketing_campaigns')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data as unknown as CampanaMarketing[];
  }

  async campana(id: number, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('marketing_campaigns')
      .select('*')
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return data as unknown as CampanaMarketing | null;
  }

  async actualizarCampana(
    id: number,
    companyId: number,
    cambios: Record<string, unknown>,
  ) {
    const { data, error } = await this.supabase.client
      .from('marketing_campaigns')
      .update(cambios)
      .eq('id', id)
      .eq('company_id', companyId)
      .select('*')
      .single();
    if (error) throw error;
    return data as unknown as CampanaMarketing;
  }

  async enviosDe(campaignId: number): Promise<Set<string>> {
    const { data, error } = await this.supabase.client
      .from('marketing_sends')
      .select('email')
      .eq('campaign_id', campaignId);
    if (error) throw error;
    return new Set(
      ((data ?? []) as { email: string }[]).map((s) => s.email.toLowerCase()),
    );
  }

  async registrarEnvios(rows: Record<string, unknown>[]) {
    if (rows.length === 0) return;
    const { error } = await this.supabase.client
      .from('marketing_sends')
      .insert(rows);
    if (error) throw error;
  }
}
