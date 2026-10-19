import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';
import type { OfertaDeLaPropuesta } from '../generacion/oferta-de-la-propuesta';
import { type FilaDeLaMatriz, leerArmado } from './armar-la-oferta';
import type { ArchivoDelSet } from './el-set';

// LA COTIZACIÓN DE LA POSTULACIÓN (decisión 29 del doc 17, 19-10): lo que
// la oportunidad necesita leer y escribir. Aparte del repositorio grande,
// que está en el tope de 800 líneas del portero.

export type OportunidadParaCotizar = {
  id: number;
  codigo: string;
  /** Desde «Postulada», lo postulado queda fijo (congelada.ts). */
  estado: string;
  quotation_id: string | null;
  etiquetas: string[] | null;
  proceso: {
    nombre: string;
    organismo: string | null;
    monto: number | null;
    fecha_cierre: string | null;
  };
};

export type CotizacionDeLaPostulacion = {
  id: string;
  quotation_number: number;
  quotation_status: string;
  people_count: number;
  children_count: number | null;
  event_date: string | null;
  items: Record<string, unknown> | null;
  subtotal_amount: number | null;
  discount_amount: number | null;
  total_amount: number | null;
  client: { name: string } | null;
};

export type PropuestaConOferta = {
  id: number;
  resultado: Record<string, unknown> | null;
};

const COLUMNAS_DE_LA_COTIZACION =
  'id, quotation_number, quotation_status, people_count, children_count, event_date, items, subtotal_amount, discount_amount, total_amount, client:clients(name)';

@Injectable()
export class PostulacionRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PostulacionRepository.name);
  }

  private get db() {
    return this.supabase.client;
  }

  async oportunidad(
    companyId: number,
    id: number,
  ): Promise<OportunidadParaCotizar | null> {
    const { data, error } = await this.db
      .from('oportunidades')
      .select(
        'id, codigo, estado, quotation_id, etiquetas, proceso:mp_procesos!inner(nombre, organismo, monto, fecha_cierre)',
      )
      .eq('company_id', companyId)
      .eq('id', id)
      .maybeSingle();
    if (error) throw error;
    return (data as OportunidadParaCotizar | null) ?? null;
  }

  async vincular(
    companyId: number,
    id: number,
    quotationId: string,
  ): Promise<void> {
    const { error } = await this.db
      .from('oportunidades')
      .update({ quotation_id: quotationId })
      .eq('company_id', companyId)
      .eq('id', id);
    if (error) throw error;
  }

  /** Una cotización de la empresa, por su id o por su número. */
  async cotizacion(
    companyId: number,
    cual: { id: string } | { numero: number },
  ): Promise<CotizacionDeLaPostulacion | null> {
    let consulta = this.db
      .from('quotations')
      .select(COLUMNAS_DE_LA_COTIZACION)
      .eq('company_id', companyId);
    consulta =
      'id' in cual
        ? consulta.eq('id', cual.id)
        : consulta.eq('quotation_number', cual.numero);
    const { data, error } = await consulta.maybeSingle();
    if (error) throw error;
    return (data as unknown as CotizacionDeLaPostulacion | null) ?? null;
  }

  /** La última propuesta técnica lista: de su oferta sale la cotización. */
  async ultimaPropuesta(
    companyId: number,
    oportunidadId: number,
  ): Promise<PropuestaConOferta | null> {
    const { data, error } = await this.db
      .from('oportunidad_generacion')
      .select('id, resultado')
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
      // La oferta armada (decisión 33) o, antes de ella, la que dejaba la
      // propuesta técnica (decisión 29): la más nueva de las dos.
      .in('tipo', ['oferta', 'propuesta'])
      .eq('estado', 'listo')
      .order('id', { ascending: false })
      .limit(1);
    if (error) throw error;
    return ((data ?? [])[0] as PropuestaConOferta | undefined) ?? null;
  }

  /** Lo postulado (decisión 33): la última oferta armada (su matriz y sus
   *  productos) y el número de la cotización que la copia. null si todavía
   *  no se arma. */
  async loPostulado(
    companyId: number,
    oportunidadId: number,
  ): Promise<{
    matriz: FilaDeLaMatriz[];
    oferta: OfertaDeLaPropuesta;
    cotizacion: number | null;
  } | null> {
    const [armada, oportunidad] = await Promise.all([
      this.db
        .from('oportunidad_generacion')
        .select('resultado')
        .eq('company_id', companyId)
        .eq('oportunidad_id', oportunidadId)
        .eq('tipo', 'oferta')
        .eq('estado', 'listo')
        .order('id', { ascending: false })
        .limit(1),
      this.oportunidad(companyId, oportunidadId),
    ]);
    if (armada.error) throw armada.error;
    const leido = leerArmado(armada.data?.[0]?.resultado);
    if (!leido) return null;
    const cotizacion = oportunidad?.quotation_id
      ? await this.cotizacion(companyId, { id: oportunidad.quotation_id })
      : null;
    return {
      matriz: leido.matriz,
      oferta: leido.oferta,
      cotizacion: cotizacion?.quotation_number ?? null,
    };
  }

  /** Los archivos de la oportunidad para el set de Mercado Público
   *  (decisión 34): las bases (de qué formulario salió cada anexo) y lo de
   *  «Mi postulación», con el trabajo de la IA que lo hizo. */
  async archivosDelSet(
    companyId: number,
    oportunidadId: number,
  ): Promise<ArchivoDelSet[]> {
    const { data, error } = await this.db
      .from('oportunidad_adjuntos')
      .select(
        'id, nombre, ruta, bytes, seccion, origen, viene_de, generacion_id, creado_en',
      )
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
      // Las ofertas de la competencia (migración 153) no van en el set.
      .in('seccion', ['bases', 'postulacion'])
      .order('creado_en', { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as ArchivoDelSet[];
  }

  /** Los trabajos de la IA de la oportunidad: cuándo empezó cada uno y
   *  cuándo quedó lista la oferta (lo hecho antes, quedó viejo). */
  async trabajosDeLaIA(
    companyId: number,
    oportunidadId: number,
  ): Promise<
    Array<{
      id: number;
      tipo: string;
      estado: string;
      creado_en: string;
      terminado_en: string | null;
    }>
  > {
    const { data, error } = await this.db
      .from('oportunidad_generacion')
      .select('id, tipo, estado, creado_en, terminado_en')
      .eq('company_id', companyId)
      .eq('oportunidad_id', oportunidadId)
      .order('id', { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as Array<{
      id: number;
      tipo: string;
      estado: string;
      creado_en: string;
      terminado_en: string | null;
    }>;
  }

  /** Los tipos de cliente que la empresa ya usa: el comprador nuevo entra
   *  con el de los públicos si existe. */
  async tiposDeCliente(companyId: number): Promise<string[]> {
    const { data, error } = await this.db
      .from('clients')
      .select('client_type')
      .eq('company_id', companyId)
      .limit(1000);
    if (error) throw error;
    return [
      ...new Set(
        ((data ?? []) as Array<{ client_type: string | null }>)
          .map((c) => c.client_type?.trim() ?? '')
          .filter(Boolean),
      ),
    ];
  }
}
