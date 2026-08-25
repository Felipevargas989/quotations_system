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
  boton_texto: string | null;
  boton_url: string | null;
  audiencia_tipo: 'clientes' | 'importada';
  audiencia_ref: string | null;
  tipos_cliente: string[] | null;
  estado: 'borrador' | 'enviada';
  prueba_enviada_at: string | null;
  enviada_at: string | null;
  total_destinatarios: number | null;
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

  async audienciasImportadas(companyId: number) {
    const { data, error } = await this.supabase.client
      .from('marketing_contacts')
      .select('audiencia')
      .eq('company_id', companyId);
    if (error) throw error;
    const conteo = new Map<string, number>();
    for (const r of (data ?? []) as { audiencia: string }[]) {
      conteo.set(r.audiencia, (conteo.get(r.audiencia) ?? 0) + 1);
    }
    return [...conteo.entries()].map(([audiencia, contactos]) => ({
      audiencia,
      contactos,
    }));
  }

  async contactosDeAudiencia(companyId: number, audiencia: string) {
    const { data, error } = await this.supabase.client
      .from('marketing_contacts')
      .select('email, name, empresa')
      .eq('company_id', companyId)
      .eq('audiencia', audiencia);
    if (error) throw error;
    return data as {
      email: string;
      name: string | null;
      empresa: string | null;
    }[];
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
