import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BUCKET_PRIVADO } from 'src/storage/storage.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { CotizacionCandidata } from './elegir-cotizacion';

/**
 * Lo que el robot de correo necesita leer y escribir (doc 23). Todo
 * filtrado por la empresa del robot (`ROBOT_OC_EMPRESA`), nunca otra.
 */
@Injectable()
export class RobotOcRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RobotOcRepository.name);
  }

  /** Las cotizaciones de la empresa con lo que hace falta para cruzar una
   *  OC: su cliente con correos y RUT, su contacto y las OC ya cargadas.
   *  Son unos cientos de filas chicas y el robot pasa dos veces al día. */
  async candidatas(companyId: number): Promise<CotizacionCandidata[]> {
    const db = this.supabase.client;
    const [cot, cli, con, rs] = await Promise.all([
      db
        .from('quotations')
        .select(
          'id, quotation_number, quotation_status, total_amount, event_date, client_id, client_contact_id',
        )
        .eq('company_id', companyId),
      db.from('clients').select('id, name, email').eq('company_id', companyId),
      db
        .from('client_contacts')
        .select('id, client_id, email')
        .eq('company_id', companyId),
      db
        .from('razones_sociales')
        .select('client_id, rut')
        .eq('company_id', companyId),
    ]);
    for (const r of [cot, cli, con, rs]) if (r.error) throw r.error;
    const cotizaciones = (cot.data ?? []) as {
      id: string;
      quotation_number: number;
      quotation_status: string;
      total_amount: number | string | null;
      event_date: string | null;
      client_id: string | null;
      client_contact_id: number | null;
    }[];
    const ids = cotizaciones.map((c) => c.id);

    const [ocs, docs] = await Promise.all([
      db
        .from('ordenes_de_compra')
        .select('quotation_id, numero')
        .eq('company_id', companyId),
      // event_documents no tiene company_id: va por las cotizaciones de la
      // empresa, de a trozos para no pasarse del largo de la URL.
      this.documentosDeOc(ids),
    ]);
    if (ocs.error) throw ocs.error;

    const clientes = new Map(
      (
        (cli.data ?? []) as { id: string; name: string; email: string | null }[]
      ).map((c) => [c.id, c]),
    );
    const contactos = (con.data ?? []) as {
      id: number;
      client_id: string;
      email: string | null;
    }[];
    const ruts = (rs.data ?? []) as { client_id: string; rut: string | null }[];
    const cargadas = new Map<string, string[]>();
    const anotar = (q: string, n: string | null) => {
      if (!n) return;
      cargadas.set(q, [...(cargadas.get(q) ?? []), n]);
    };
    for (const o of (ocs.data ?? []) as {
      quotation_id: string;
      numero: string | null;
    }[])
      anotar(o.quotation_id, o.numero);
    for (const d of docs) {
      anotar(d.quotation_id, d.file_name);
      anotar(d.quotation_id, d.file_url.split('/').pop() ?? null);
    }

    return cotizaciones
      .filter((c) => c.client_id && clientes.has(c.client_id))
      .map((c) => {
        const cliente = clientes.get(c.client_id as string)!;
        const delCliente = contactos.filter((x) => x.client_id === cliente.id);
        return {
          id: c.id,
          numero: c.quotation_number,
          estado: c.quotation_status,
          total: Number(c.total_amount) || 0,
          fecha_evento: c.event_date,
          cliente_id: cliente.id,
          cliente: cliente.name,
          correo_contacto:
            contactos.find((x) => x.id === c.client_contact_id)?.email ?? null,
          correos_cliente: [
            cliente.email,
            ...delCliente.map((x) => x.email),
          ].filter((x): x is string => !!x),
          ruts_cliente: ruts
            .filter((r) => r.client_id === cliente.id && r.rut)
            .map((r) => r.rut as string),
          ocs_cargadas: cargadas.get(c.id) ?? [],
        };
      });
  }

  private async documentosDeOc(ids: string[]) {
    const salida: {
      quotation_id: string;
      file_name: string;
      file_url: string;
    }[] = [];
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await this.supabase.client
        .from('event_documents')
        .select('quotation_id, file_name, file_url')
        .eq('category', 'ordenes_compra')
        .in('quotation_id', ids.slice(i, i + 150));
      if (error) throw error;
      salida.push(...((data ?? []) as typeof salida));
    }
    return salida;
  }

  /** Sube el PDF al balde privado, con la misma forma de ruta que la
   *  puerta única de archivos (`c<empresa>/event-documents/...`). */
  async subirPdf(ruta: string, contenido: Buffer) {
    this.logger.info(`robot OC: sube ${ruta} (${contenido.length} bytes)`);
    const { error } = await this.supabase.client.storage
      .from(BUCKET_PRIVADO)
      .upload(ruta, contenido, {
        contentType: 'application/pdf',
        cacheControl: '3600',
        upsert: false,
      });
    if (error) throw error;
  }

  /** La fila de Documentos → «Órdenes de compra» (la cotización ya es de
   *  la empresa: salió de `candidatas`). */
  async agregarDocumento(quotationId: string, nombre: string, ruta: string) {
    const { data, error } = await this.supabase.client
      .from('event_documents')
      .insert({
        quotation_id: quotationId,
        category: 'ordenes_compra',
        file_name: nombre,
        file_url: ruta,
      })
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: number }).id;
  }
}
