import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { BUCKET_PRIVADO } from 'src/storage/storage.service';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { Receptor } from '../archivo/tipos';
import type { AmbienteDeFacturacion } from '../facturacion-cl/facturacion-cl';
import { facturadoDeLasOC, type DocumentoDeLaCadena } from '../notas/cadena';
import type { EventoAFacturar, OrdenAFacturar } from './borrador';
import type { DocumentoConSuNombre } from './nombre-del-pdf';

/** Un documento tributario (tabla `documentos_tributarios`, migración 184). */
export interface DocumentoTributario {
  id: number;
  company_id: number;
  tipo: number;
  ambiente: AmbienteDeFacturacion;
  folio: number | null;
  fecha_emision: string | null;
  estado: 'borrador' | 'enviando' | 'emitido' | 'por_confirmar' | 'rechazado';
  receptor: Receptor;
  detalle: unknown[];
  referencias: unknown[];
  neto: number;
  exento: number;
  iva: number;
  total: number;
  quotation_id: string | null;
  orden_de_compra_id: number | null;
  porcentaje: number | null;
  modifica_id: number | null;
  codigo_referencia: number | null;
  error: string | null;
  pdf_path: string | null;
  creado_por: string | null;
  emitido_por: string | null;
  emitido_en: string | null;
  created_at: string;
  /** La factura (§9.22, migración 189): 1 contado, 2 crédito; y su
   *  vencimiento. Nulos en lo de antes y en la boleta. */
  forma_de_pago: number | null;
  vencimiento: string | null;
}

export type NuevoDocumentoTributario = Pick<
  DocumentoTributario,
  | 'company_id'
  | 'tipo'
  | 'ambiente'
  | 'estado'
  | 'receptor'
  | 'detalle'
  | 'referencias'
  | 'neto'
  | 'exento'
  | 'iva'
  | 'total'
  | 'quotation_id'
  | 'orden_de_compra_id'
  | 'porcentaje'
  | 'creado_por'
> & {
  archivo_enviado: string;
  /** Las notas (paso 4): lo que modifican y cómo. */
  modifica_id?: number | null;
  codigo_referencia?: number | null;
  /** Lo que se sabe al mandarla (la boleta: el folio que debería tocarle,
   *  para «Comprobar» si se corta). */
  respuesta?: unknown;
  /** La condición de pago de la factura (migración 189). */
  forma_de_pago?: number | null;
  vencimiento?: string | null;
};

/** Un cliente con sus razones sociales y su contacto principal, para
 *  elegir a quién va la factura de «Nuevo documento» (§9.22). */
export interface ClienteParaFacturar {
  id: string;
  nombre: string;
  tipo: string | null;
  contacto: {
    nombre: string;
    correo: string | null;
    telefono: string | null;
  } | null;
  razones: {
    id: number;
    rut: string;
    razon_social: string;
    giro: string | null;
    direccion: string | null;
    comuna: string | null;
    ciudad: string | null;
    correo_facturacion: string | null;
    referencias_exigidas: string[];
  }[];
}

export type CambiosDelDocumento = Partial<
  Pick<
    DocumentoTributario,
    | 'estado'
    | 'folio'
    | 'fecha_emision'
    | 'error'
    | 'pdf_path'
    | 'emitido_por'
    | 'emitido_en'
  >
> & {
  archivo_enviado?: string;
  respuesta?: unknown;
  url_original?: string | null;
  url_cedible?: string | null;
};

// Lo que la pantalla ve: ni el archivo enviado ni la respuesta cruda.
const COLUMNAS =
  'id, company_id, tipo, ambiente, folio, fecha_emision, estado, receptor, detalle, referencias, neto, exento, iva, total, quotation_id, orden_de_compra_id, porcentaje, modifica_id, codigo_referencia, error, pdf_path, creado_por, emitido_por, emitido_en, created_at, forma_de_pago, vencimiento';

// Las filas de cada pedido a la base: lo más que entrega de una vez.
const PAGINA = 1000;

// Lo que cuenta como facturado: lo emitido y lo que quedó por confirmar
// (puede haber salido: L5). Las notas de crédito restan en el paso 4.
const FACTURADO = ['emitido', 'por_confirmar', 'enviando'];

// Cada consulta filtra por company_id (mapa 22). Los registros llevan solo
// ids: el receptor es un dato del cliente. No hay borrar: un documento
// tributario no se borra nunca (L6), y el motor no tiene permiso de DELETE.
@Injectable()
export class DocumentosTributariosRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DocumentosTributariosRepository.name);
  }

  /** El evento que se factura, si es de la empresa. */
  async eventoAFacturar(
    quotationId: string,
    companyId: number,
  ): Promise<EventoAFacturar | null> {
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select(
        'id, quotation_number, quotation_status, event_type, event_date, event_end_date, people_count, children_count, total_amount, client_id, cliente:clients(name, email, client_type), mandante:client_contacts!quotations_client_contact_id_fkey(email)',
      )
      .eq('id', quotationId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;
    const q = data as unknown as {
      id: string;
      quotation_number: number;
      quotation_status: string;
      event_type: string | null;
      event_date: string | null;
      event_end_date: string | null;
      people_count: number | null;
      children_count: number | null;
      total_amount: number | string | null;
      client_id: string | null;
      cliente: {
        name?: string | null;
        email?: string | null;
        client_type?: string | null;
      } | null;
      mandante: { email?: string | null } | null;
    };
    return {
      id: q.id,
      numero: q.quotation_number,
      estado: q.quotation_status,
      tipoDeEvento: q.event_type,
      desde: q.event_date ? q.event_date.slice(0, 10) : null,
      hasta: q.event_end_date ? q.event_end_date.slice(0, 10) : null,
      personas: q.people_count,
      ninos: q.children_count,
      total: Math.round(Number(q.total_amount ?? 0)),
      clientId: q.client_id,
      cliente: q.cliente?.name?.trim() || null,
      tipoDeCliente: q.cliente?.client_type?.trim() || null,
      correo: q.mandante?.email?.trim() || q.cliente?.email?.trim() || null,
    };
  }

  /** Las OC del evento (sin lo facturado: lo suma el servicio). */
  async ordenesDelEvento(quotationId: string, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('ordenes_de_compra')
      .select(
        'id, numero, fecha, rut, razon_social, comprador, descripcion, neto, iva, total, documento_id',
      )
      .eq('quotation_id', quotationId)
      .eq('company_id', companyId)
      .order('fecha', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    return (data ?? []) as (Omit<OrdenAFacturar, 'facturado' | 'pdf'> & {
      documento_id: number | null;
    })[];
  }

  /** El nombre del PDF de una OC (la cotización ya se verificó). */
  async nombreDelDocumento(documentoId: number, quotationId: string) {
    const { data, error } = await this.supabase.client
      .from('event_documents')
      .select('file_name')
      .eq('id', documentoId)
      .eq('quotation_id', quotationId)
      .maybeSingle();
    if (error) throw error;
    return (data as { file_name?: string } | null)?.file_name ?? null;
  }

  /** Los documentos tributarios del evento, del más nuevo al más viejo. */
  async deCotizacion(quotationId: string, companyId: number) {
    this.logger.info(`documentos tributarios de la cotización ${quotationId}`);
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .select(COLUMNAS)
      .eq('quotation_id', quotationId)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as DocumentoTributario[];
  }

  /** Lo facturado del evento y de cada una de sus OC, con la cadena (paso
   *  4): `facturadoDeLasOC`. Lo del evento cuenta también sus boletas
   *  (§9.20). Solo lo del ambiente donde se emite: una factura simulada no
   *  factura una OC de verdad (§9.18). */
  async facturado(
    quotationId: string,
    companyId: number,
    ambiente: AmbienteDeFacturacion,
  ) {
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .select(
        'id, tipo, folio, estado, total, fecha_emision, modifica_id, codigo_referencia, orden_de_compra_id',
      )
      .eq('quotation_id', quotationId)
      .eq('company_id', companyId)
      .eq('ambiente', ambiente)
      .in('tipo', [33, 39, 56, 61])
      .in('estado', FACTURADO);
    if (error) throw error;
    return facturadoDeLasOC(
      (
        (data ?? []) as (DocumentoDeLaCadena & {
          orden_de_compra_id: number | null;
        })[]
      ).map((d) => ({ ...d, total: Number(d.total) })),
    );
  }

  /** Un documento entero, con el archivo y la respuesta («Comprobar»,
   *  las notas). */
  async documento(id: number, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .select(`${COLUMNAS}, archivo_enviado, respuesta`)
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return (data ?? null) as unknown as
      | (DocumentoTributario & {
          archivo_enviado: string | null;
          respuesta: unknown;
        })
      | null;
  }

  /** Los documentos de un período (la lista de Facturación), con el N° del
   *  evento y de la OC: los emitidos en esas fechas y, siempre, los que
   *  esperan «Comprobar» (L5). `desde` y `hasta` son AAAA-MM-DD de Chile
   *  (hasta, excluido). */
  async delPeriodo(
    companyId: number,
    desde: string,
    hasta: string,
    tipos?: number[],
  ) {
    type Fila = DocumentoTributario & {
      cotizacion: {
        quotation_number: number;
        cliente: { name: string | null } | null;
      } | null;
      oc: { numero: string } | null;
    };
    // Por páginas (§9.22, sprint 2): con un rango de hasta un año, las
    // boletas de las cabañas pasan de las mil filas que entrega la base de
    // una vez, y lo que sobra no puede quedar fuera sin avisar.
    const filas: Fila[] = [];
    for (let inicio = 0; ; inicio += PAGINA) {
      let consulta = this.supabase.client
        .from('documentos_tributarios')
        .select(
          `${COLUMNAS}, cotizacion:quotations(quotation_number, cliente:clients(name)), oc:ordenes_de_compra(numero)`,
        )
        .eq('company_id', companyId)
        .in('estado', FACTURADO)
        .or(
          `and(fecha_emision.gte.${desde},fecha_emision.lt.${hasta}),estado.in.(por_confirmar,enviando)`,
        );
      if (tipos?.length) consulta = consulta.in('tipo', tipos);
      const { data, error } = await consulta
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(inicio, inicio + PAGINA - 1);
      if (error) throw error;
      const pagina = (data ?? []) as unknown as Fila[];
      filas.push(...pagina);
      if (pagina.length < PAGINA) return filas;
    }
  }

  /** La cadena entera de la empresa: facturas y notas, livianas (las
   *  boletas no tienen notas todavía, L21). */
  async cadenaDeLaEmpresa(companyId: number) {
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .select(
        'id, tipo, ambiente, folio, estado, total, fecha_emision, modifica_id, codigo_referencia, orden_de_compra_id, created_at',
      )
      .eq('company_id', companyId)
      .in('tipo', [33, 56, 61])
      .in('estado', FACTURADO);
    if (error) throw error;
    return (
      (data ?? []) as (DocumentoDeLaCadena & {
        ambiente: AmbienteDeFacturacion;
        orden_de_compra_id: number | null;
        created_at: string;
      })[]
    ).map((d) => ({ ...d, total: Number(d.total) }));
  }

  /** Los eventos aceptados o realizados desde una fecha (AAAA-MM-DD),
   *  para «Por facturar» (doc 19 §9.21). Desde el 08-11 (§9.31), con el
   *  contacto y los RUT del cliente, para el buscador. */
  async eventosDesde(companyId: number, desde: string) {
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select(
        'id, quotation_number, quotation_status, event_type, event_date, total_amount, contact_name, contacto:client_contacts(name), cliente:clients(name, contact_person, razones:razones_sociales(rut))',
      )
      .eq('company_id', companyId)
      .in('quotation_status', ['aceptada', 'realizada'])
      .gte('event_date', desde)
      .order('event_date', { ascending: true })
      .limit(300);
    if (error) throw error;
    return (
      (data ?? []) as unknown as {
        id: string;
        quotation_number: number;
        quotation_status: string;
        event_type: string | null;
        event_date: string | null;
        total_amount: number | string | null;
        contact_name?: string | null;
        contacto?: { name?: string | null } | null;
        cliente: {
          name?: string | null;
          contact_person?: string | null;
          razones?: { rut: string }[] | null;
        } | null;
      }[]
    ).map((q) => ({
      id: q.id,
      numero: q.quotation_number,
      estado: q.quotation_status,
      tipoDeEvento: q.event_type,
      fecha: q.event_date ? q.event_date.slice(0, 10) : null,
      total: Math.round(Number(q.total_amount ?? 0)),
      cliente: q.cliente?.name?.trim() || null,
      // El de la cotización, o el de la ficha (como el correo tipo).
      contacto:
        q.contacto?.name?.trim() ||
        q.contact_name?.trim() ||
        q.cliente?.contact_person?.trim() ||
        null,
      ruts: (q.cliente?.razones ?? []).map((z) => z.rut),
    }));
  }

  /** Lo emitido de esos eventos en un ambiente, con sus notas (las notas
   *  heredan el evento de lo que modifican): para la cadena. */
  async emitidoDeLosEventos(
    companyId: number,
    ambiente: AmbienteDeFacturacion,
    ids: string[],
  ) {
    if (!ids.length) return [];
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .select(
        'id, tipo, folio, estado, total, fecha_emision, modifica_id, codigo_referencia, orden_de_compra_id, quotation_id',
      )
      .eq('company_id', companyId)
      .eq('ambiente', ambiente)
      .in('quotation_id', ids)
      .in('tipo', [33, 39, 56, 61])
      .in('estado', FACTURADO);
    if (error) throw error;
    return (
      (data ?? []) as (DocumentoDeLaCadena & {
        orden_de_compra_id: number | null;
        quotation_id: string;
      })[]
    ).map((d) => ({ ...d, total: Number(d.total) }));
  }

  /** Las OC de cada evento de «Por facturar» (§9.26): su N° y su total,
   *  para decir cuál está facturada, cuál a medias y cuál falta. */
  async ordenesDeLosEventos(companyId: number, ids: string[]) {
    const porEvento = new Map<
      string,
      { id: number; numero: string; total: number; rut: string | null }[]
    >();
    if (!ids.length) return porEvento;
    const { data, error } = await this.supabase.client
      .from('ordenes_de_compra')
      .select('id, quotation_id, numero, total, rut')
      .eq('company_id', companyId)
      .in('quotation_id', ids)
      .order('id', { ascending: true });
    if (error) throw error;
    for (const o of (data ?? []) as {
      id: number;
      quotation_id: string;
      numero: string;
      total: number | string;
      rut?: string | null;
    }[])
      porEvento.set(o.quotation_id, [
        ...(porEvento.get(o.quotation_id) ?? []),
        {
          id: o.id,
          numero: o.numero,
          total: Number(o.total),
          // El RUT de la OC, para el buscador (§9.31).
          rut: o.rut ?? null,
        },
      ]);
    return porEvento;
  }

  /** Los PDF de «Órdenes de compra» de cada evento que BelIA todavía no
   *  deja como OC (§9.26): se leen al subirlos, y los de antes, en la
   *  primera lectura de «Por facturar». La tabla de documentos no tiene
   *  `company_id`: los eventos ya son de la empresa. */
  async ocsSinLeerDeLosEventos(companyId: number, ids: string[]) {
    const cuantas = new Map<string, number>();
    if (!ids.length) return cuantas;
    const [pdfs, leidas] = await Promise.all([
      this.supabase.client
        .from('event_documents')
        .select('id, quotation_id')
        .eq('category', 'ordenes_compra')
        .in('quotation_id', ids),
      this.supabase.client
        .from('ordenes_de_compra')
        .select('documento_id')
        .eq('company_id', companyId)
        .in('quotation_id', ids)
        .not('documento_id', 'is', null),
    ]);
    if (pdfs.error) throw pdfs.error;
    if (leidas.error) throw leidas.error;
    const yaLeidos = new Set(
      ((leidas.data ?? []) as { documento_id: number }[]).map(
        (o) => o.documento_id,
      ),
    );
    for (const d of (pdfs.data ?? []) as { id: number; quotation_id: string }[])
      if (!yaLeidos.has(d.id))
        cuantas.set(d.quotation_id, (cuantas.get(d.quotation_id) ?? 0) + 1);
    return cuantas;
  }

  /** Los eventos marcados con «Ya está facturado» (doc 19 §9.24, migración
   *  191): se facturaron fuera de Eventia y salen de «Por facturar». */
  async facturadosFuera(companyId: number, ids: string[]) {
    const marcados = new Map<string, { por: string | null; en: string }>();
    if (!ids.length) return marcados;
    const { data, error } = await this.supabase.client
      .from('eventos_facturados_fuera')
      .select('quotation_id, marcado_por_nombre, created_at')
      .eq('company_id', companyId)
      .in('quotation_id', ids);
    if (error) throw error;
    for (const m of (data ?? []) as {
      quotation_id: string;
      marcado_por_nombre: string | null;
      created_at: string;
    }[])
      marcados.set(m.quotation_id, {
        por: m.marcado_por_nombre,
        en: m.created_at,
      });
    return marcados;
  }

  /** De esos eventos (ya filtrados por la empresa), los que tienen en
   *  Documentos el PDF de una factura subido a mano: el aviso «Tiene
   *  factura en Documentos» (§9.24). Las copias que deja Eventia al emitir
   *  (`pdf_path` de lo emitido) no cuentan: eso ya lo dice lo emitido. */
  async conFacturaEnDocumentos(companyId: number, ids: string[]) {
    const con = new Set<string>();
    if (!ids.length) return con;
    const [subidos, copias] = await Promise.all([
      this.supabase.client
        .from('event_documents')
        .select('quotation_id, file_url')
        .eq('category', 'facturas')
        .in('quotation_id', ids),
      this.supabase.client
        .from('documentos_tributarios')
        .select('pdf_path')
        .eq('company_id', companyId)
        .in('quotation_id', ids)
        .not('pdf_path', 'is', null),
    ]);
    if (subidos.error) throw subidos.error;
    if (copias.error) throw copias.error;
    const deEventia = new Set(
      ((copias.data ?? []) as { pdf_path: string }[]).map((c) => c.pdf_path),
    );
    for (const d of (subidos.data ?? []) as {
      quotation_id: string;
      file_url: string;
    }[])
      if (!deEventia.has(d.file_url)) con.add(d.quotation_id);
    return con;
  }

  /** «Ya está facturado»: lo marca (o lo deja como estaba si ya lo está). */
  async marcarFacturadoFuera(
    companyId: number,
    quotationId: string,
    por: { id: string | null; nombre: string | null },
  ) {
    const { error } = await this.supabase.client
      .from('eventos_facturados_fuera')
      .upsert(
        {
          quotation_id: quotationId,
          company_id: companyId,
          marcado_por: por.id,
          marcado_por_nombre: por.nombre,
        },
        { onConflict: 'quotation_id', ignoreDuplicates: true },
      );
    if (error) throw error;
  }

  /** «Devolver»: el evento vuelve a «Por facturar». */
  async desmarcarFacturadoFuera(companyId: number, quotationId: string) {
    const { error } = await this.supabase.client
      .from('eventos_facturados_fuera')
      .delete()
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId);
    if (error) throw error;
  }

  /** La razón social guardada con ese RUT (de cualquier cliente de la
   *  empresa), para llenar la factura de «Nuevo documento» (§9.21). */
  async razonSocialDeLaEmpresa(companyId: number, rut: string) {
    const { data, error } = await this.supabase.client
      .from('razones_sociales')
      .select(
        'rut, razon_social, giro, direccion, comuna, ciudad, correo_facturacion, referencias_exigidas, cliente:clients(name)',
      )
      .eq('company_id', companyId)
      .eq('rut', rut)
      .limit(1);
    if (error) throw error;
    const r = (data ?? [])[0] as
      | {
          rut: string;
          razon_social: string;
          giro: string | null;
          direccion: string | null;
          comuna: string | null;
          ciudad: string | null;
          correo_facturacion: string | null;
          referencias_exigidas: string[] | null;
          cliente: { name?: string | null } | null;
        }
      | undefined;
    if (!r) return null;
    return {
      rut: r.rut,
      razon_social: r.razon_social,
      giro: r.giro,
      direccion: r.direccion,
      comuna: r.comuna,
      ciudad: r.ciudad,
      correo_facturacion: r.correo_facturacion,
      referencias_exigidas: r.referencias_exigidas ?? [],
      cliente: r.cliente?.name?.trim() || null,
    };
  }

  /** Los clientes de la empresa con sus razones sociales y su contacto
   *  principal: el buscador del destinatario (§9.22) busca por el nombre y
   *  por el RUT. */
  async clientesParaFacturar(
    companyId: number,
  ): Promise<ClienteParaFacturar[]> {
    const { data, error } = await this.supabase.client
      .from('clients')
      .select(
        // El contacto vive en client_contacts; la ficha guarda solo el
        // nombre (contact_person) y su correo y teléfono (email, phone).
        'id, name, client_type, contact_person, email, phone, contactos:client_contacts(name, email, phone, is_primary), razones:razones_sociales(id, rut, razon_social, giro, direccion, comuna, ciudad, correo_facturacion, referencias_exigidas)',
      )
      .eq('company_id', companyId)
      .order('name');
    if (error) throw error;
    type Fila = {
      id: string;
      name: string | null;
      client_type: string | null;
      contact_person: string | null;
      email: string | null;
      phone: string | null;
      contactos:
        | {
            name: string | null;
            email: string | null;
            phone: string | null;
            is_primary: boolean | null;
          }[]
        | null;
      razones: ClienteParaFacturar['razones'] | null;
    };
    return ((data ?? []) as unknown as Fila[]).map((c) => {
      const principal =
        (c.contactos ?? []).find((x) => x.is_primary) ?? (c.contactos ?? [])[0];
      const nombre = principal?.name?.trim() || c.contact_person?.trim() || '';
      return {
        id: c.id,
        nombre: c.name?.trim() || '',
        tipo: c.client_type,
        contacto: nombre
          ? {
              nombre,
              correo: principal?.email ?? c.email ?? null,
              telefono: principal?.phone ?? c.phone ?? null,
            }
          : null,
        razones: (c.razones ?? []).map((r) => ({
          ...r,
          referencias_exigidas: r.referencias_exigidas ?? [],
        })),
      };
    });
  }

  /** El último folio usado de un tipo, para seguir la numeración. */
  async ultimoFolio(
    companyId: number,
    ambiente: AmbienteDeFacturacion,
    tipo: number,
  ): Promise<number> {
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .select('folio')
      .eq('company_id', companyId)
      .eq('ambiente', ambiente)
      .eq('tipo', tipo)
      .not('folio', 'is', null)
      .order('folio', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return Number((data as { folio?: number } | null)?.folio ?? 0);
  }

  async crear(fila: NuevoDocumentoTributario) {
    this.logger.info(
      `nuevo documento tipo ${fila.tipo} de la cotización ${fila.quotation_id}`,
    );
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .insert([fila])
      .select(COLUMNAS)
      .single();
    if (error) throw error;
    return data as unknown as DocumentoTributario;
  }

  async actualizar(
    id: number,
    companyId: number,
    cambios: CambiosDelDocumento,
  ) {
    this.logger.info(
      `documento tributario ${id}: ${cambios.estado ?? 'cambios'}`,
    );
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId)
      .select(COLUMNAS)
      .single();
    if (error) throw error;
    return data as unknown as DocumentoTributario;
  }

  /** Lo que lleva el nombre del PDF (§9.35): el cliente como está en
   *  Eventia (si no, la razón social o la cabaña), el N° de la cotización
   *  y la OC. */
  async datosDelNombreDelPdf(
    id: number,
    companyId: number,
  ): Promise<Omit<DocumentoConSuNombre, 'tipo' | 'folio'> | null> {
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .select(
        'receptor, detalle, cotizacion:quotations(quotation_number, cliente:clients(name)), oc:ordenes_de_compra(numero)',
      )
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return data as Omit<DocumentoConSuNombre, 'tipo' | 'folio'> | null;
  }

  /** La copia propia del PDF, en el balde privado (L10). */
  async guardarPdf(ruta: string, pdf: Buffer) {
    const { error } = await this.supabase.client.storage
      .from(BUCKET_PRIVADO)
      .upload(ruta, pdf, { contentType: 'application/pdf', upsert: true });
    if (error) throw error;
  }

  /** El PDF en Documentos → Facturas del evento (§9.2). */
  async agregarAlEvento(quotationId: string, nombre: string, ruta: string) {
    const { error } = await this.supabase.client
      .from('event_documents')
      .insert({
        quotation_id: quotationId,
        category: 'facturas',
        file_name: nombre,
        file_url: ruta,
      });
    if (error) throw error;
  }
}
