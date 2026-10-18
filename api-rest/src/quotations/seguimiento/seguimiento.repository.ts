import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import { ESTADOS_CON_SEGUIMIENTO, type NotaDeBitacora } from './elegibles';

// LO QUE EL BOTÓN «✉ GENERAR SEGUIMIENTO» LEE DE LA BASE (doc 18): la
// cotización con su cliente y contacto, y la bitácora. Todo filtrado por
// empresa: la llave de servicio salta el RLS. Las líneas de la bitácora las
// escribe QuotationFollowupsService.
//
// Y desde el 17-10 (doc 18 §9, migración 141) la tabla `seguimientos_con_ia`:
// cada borrador que dejó el botón, para saber si ya salió.

export type FilaDeLaCotizacion = {
  id: string;
  company_id: number;
  quotation_number: number;
  /** Cuándo se creó: el hilo de la cotización tiene movimiento después. */
  created_at: string | null;
  quotation_status: string;
  request_type: string;
  event_type: string | null;
  event_date: string | null;
  event_end_date: string | null;
  people_count: number | null;
  children_count: number | null;
  total_amount: number | string | null;
  sent_at: string | null;
  observations: string | null;
  comentario_interno: string | null;
  contact_name: string | null;
  client_contact_id: number | null;
  clients: {
    name: string | null;
    email: string | null;
    client_type: string | null;
    client_contacts: Array<{
      id: number;
      name: string | null;
      email: string | null;
    }> | null;
  } | null;
};

export type CotizacionViva = {
  id: string;
  quotation_number: number;
  quotation_status: string;
  event_type: string | null;
  event_date: string | null;
  clients: { name: string | null } | null;
};

export type NotaConCotizacion = NotaDeBitacora & { quotation_id: string };

export type EstadoDelSeguimientoConIA = 'borrador' | 'enviado' | 'descartado';

/** Una fila de `seguimientos_con_ia` (migración 141). */
export type SeguimientoConIA = {
  id: number;
  company_id: number;
  quotation_id: string;
  buzon: string;
  modo: 'seguimiento' | 'responder' | 'nuevo';
  /** Identificador INMUTABLE del mensaje en Outlook. */
  borrador_id: string;
  hilo_id: string | null;
  enlace: string | null;
  angulo: string | null;
  estado: EstadoDelSeguimientoConIA;
  enviado_at: string | null;
  revisado_at: string | null;
  creado_por: string | null;
  created_at: string;
};

const COLUMNAS_DEL_SEGUIMIENTO =
  'id, company_id, quotation_id, buzon, modo, borrador_id, hilo_id, enlace, ' +
  'angulo, estado, enviado_at, revisado_at, creado_por, created_at';

@Injectable()
export class SeguimientoRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(SeguimientoRepository.name);
  }

  /** Recorre por páginas: la base entrega de a 1.000 filas como máximo. */
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

  async cotizacion(
    id: string,
    companyId: number,
  ): Promise<FilaDeLaCotizacion | null> {
    const { data, error } = await this.supabase.client
      .from('quotations')
      .select(
        'id, company_id, quotation_number, created_at, quotation_status, request_type, ' +
          'event_type, event_date, event_end_date, people_count, children_count, ' +
          'total_amount, sent_at, observations, comentario_interno, contact_name, ' +
          'client_contact_id, clients(name, email, client_type, client_contacts(id, name, email))',
      )
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return data as FilaDeLaCotizacion | null;
  }

  /** La bitácora de una cotización, de la más antigua a la más nueva. */
  async bitacora(
    quotationId: string,
    companyId: number,
  ): Promise<NotaDeBitacora[]> {
    const { data, error } = await this.supabase.client
      .from('quotation_followups')
      .select(
        'created_at, tipo, note, author_name, next_contact_date, next_contact_done_at',
      )
      .eq('company_id', companyId)
      .eq('quotation_id', quotationId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data ?? []) as NotaDeBitacora[];
  }

  /** Las cotizaciones vivas para la venta (enviadas y en negociación). */
  async vivas(companyId: number): Promise<CotizacionViva[]> {
    const db = this.supabase.client;
    return this.todas<CotizacionViva>((d, h) =>
      db
        .from('quotations')
        .select(
          'id, quotation_number, quotation_status, event_type, event_date, clients(name)',
        )
        .eq('company_id', companyId)
        .eq('request_type', 'cotizacion')
        .in('quotation_status', ESTADOS_CON_SEGUIMIENTO)
        .order('quotation_number')
        .range(d, h),
    );
  }

  /** Guarda el borrador que acaba de dejar el botón. */
  async registrarBorrador(
    fila: Pick<
      SeguimientoConIA,
      | 'company_id'
      | 'quotation_id'
      | 'buzon'
      | 'modo'
      | 'borrador_id'
      | 'hilo_id'
      | 'enlace'
      | 'angulo'
      | 'creado_por'
    >,
  ): Promise<void> {
    const { error } = await this.supabase.client
      .from('seguimientos_con_ia')
      .insert(fila);
    if (error) throw error;
  }

  /** Los borradores que esperan en Outlook, de la empresa o de una
   *  cotización, dejados desde `desde` (ISO). */
  async borradoresEnEspera(
    companyId: number,
    desde: string,
    quotationId?: string,
  ): Promise<SeguimientoConIA[]> {
    let consulta = this.supabase.client
      .from('seguimientos_con_ia')
      .select(COLUMNAS_DEL_SEGUIMIENTO)
      .eq('company_id', companyId)
      .eq('estado', 'borrador')
      .gte('created_at', desde);
    if (quotationId) consulta = consulta.eq('quotation_id', quotationId);
    const { data, error } = await consulta.order('created_at');
    if (error) throw error;
    return (data ?? []) as unknown as SeguimientoConIA[];
  }

  /** Toma el borrador para preguntarle a Outlook: anota la hora, solo si
   *  nadie lo tomó desde que se leyó (su última revisión sigue siendo
   *  `revisadoAt`). Si dos pantallas abren a la vez, solo una lo revisa. El
   *  freno de 5 minutos lo pone el servicio con esa misma hora.
   *
   *  Sin `or` a propósito: PostgREST vuelve a aplicar un `or` sobre lo que
   *  devuelve el update, y ahí la columna no viene (medido en el
   *  laboratorio el 18-10: error 42703, «revisado_at does not exist»). */
  async tomarParaRevisar(
    companyId: number,
    id: number,
    revisadoAt: string | null,
  ): Promise<boolean> {
    const consulta = this.supabase.client
      .from('seguimientos_con_ia')
      .update({ revisado_at: new Date().toISOString() })
      .eq('company_id', companyId)
      .eq('id', id)
      .eq('estado', 'borrador');
    const { data, error } = await (
      revisadoAt
        ? consulta.eq('revisado_at', revisadoAt)
        : consulta.is('revisado_at', null)
    ).select('id');
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  /** Cierra el borrador (enviado o descartado). true solo si seguía de
   *  borrador: la línea de la bitácora se escribe una sola vez. */
  async cerrarBorrador(
    companyId: number,
    id: number,
    cambios:
      | { estado: 'enviado'; enviado_at: string }
      | { estado: 'descartado' },
  ): Promise<boolean> {
    const { data, error } = await this.supabase.client
      .from('seguimientos_con_ia')
      .update(cambios)
      .eq('company_id', companyId)
      .eq('id', id)
      .eq('estado', 'borrador')
      .select('id');
    if (error) throw error;
    return (data ?? []).length > 0;
  }

  /** Las notas con próximo contacto sin cumplir de toda la empresa: entre
   *  ellas está el compromiso vivo de cada cotización. */
  async compromisosAbiertos(companyId: number): Promise<NotaConCotizacion[]> {
    const db = this.supabase.client;
    return this.todas<NotaConCotizacion>((d, h) =>
      db
        .from('quotation_followups')
        .select(
          'quotation_id, created_at, tipo, note, next_contact_date, next_contact_done_at',
        )
        .eq('company_id', companyId)
        .not('next_contact_date', 'is', null)
        .is('next_contact_done_at', null)
        .order('id')
        .range(d, h),
    );
  }
}
