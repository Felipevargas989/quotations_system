import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { SupabaseService } from 'src/supabase/supabase.service';

/** Lo que recepción boletea suelto (migración 187, D3). */
export interface ItemDelTarifario {
  id: number;
  nombre: string;
  precio: number;
  unidad: string;
  activo: boolean;
  orden: number;
}

/** Una línea del reparto, con su boleta si ya salió. */
export interface LineaGuardada {
  id: number;
  cobro_id: number;
  cabana: string;
  monto: number;
  correo: string | null;
  documento_id: number | null;
  documento: {
    folio: number | null;
    estado: string;
    ambiente: string;
    pdf_path: string | null;
  } | null;
}

export interface CambioDelCobro {
  id: number;
  linea_id: number | null;
  que: string;
  antes: string | null;
  despues: string | null;
  nombre: string | null;
  created_at: string;
}

/** Un cobro por boletear (migración 187), con su reparto y sus cambios. */
export interface CobroGuardado {
  id: number;
  company_id: number;
  quotation_id: string | null;
  descripcion: string;
  total: number;
  creado_por: string | null;
  creado_por_nombre: string | null;
  created_at: string;
  cotizacion: { quotation_number: number } | null;
  lineas: LineaGuardada[];
  cambios: CambioDelCobro[];
}

export interface NuevoCambio {
  company_id: number;
  cobro_id: number;
  linea_id: number | null;
  que: string;
  antes: string | null;
  despues: string | null;
  usuario: string | null;
  nombre: string | null;
}

const DEL_COBRO =
  'id, company_id, quotation_id, descripcion, total, creado_por, creado_por_nombre, created_at, cotizacion:quotations(quotation_number), lineas:cobros_por_boletear_lineas(id, cobro_id, cabana, monto, correo, documento_id, documento:documentos_tributarios(folio, estado, ambiente, pdf_path)), cambios:cobros_por_boletear_cambios(id, linea_id, que, antes, despues, nombre, created_at)';

const ordenado = (c: CobroGuardado): CobroGuardado => ({
  ...c,
  total: Number(c.total),
  lineas: [...(c.lineas ?? [])]
    .map((l) => ({ ...l, monto: Number(l.monto) }))
    .sort((a, b) => a.id - b.id),
  cambios: [...(c.cambios ?? [])].sort((a, b) =>
    a.created_at.localeCompare(b.created_at),
  ),
});

// Cada consulta filtra por company_id (mapa 22). Los registros llevan solo
// ids: el correo del huésped es un dato personal.
@Injectable()
export class BoletasRepository {
  constructor(
    private readonly supabase: SupabaseService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(BoletasRepository.name);
  }

  /** Los cobros de la empresa, del más nuevo al más viejo; de un evento
   *  si se pide. */
  async cobros(companyId: number, quotationId?: string) {
    let consulta = this.supabase.client
      .from('cobros_por_boletear')
      .select(DEL_COBRO)
      .eq('company_id', companyId)
      .order('created_at', { ascending: false })
      .limit(100);
    if (quotationId) consulta = consulta.eq('quotation_id', quotationId);
    const { data, error } = await consulta;
    if (error) throw error;
    return ((data ?? []) as unknown as CobroGuardado[]).map(ordenado);
  }

  async cobro(id: number, companyId: number) {
    const { data, error } = await this.supabase.client
      .from('cobros_por_boletear')
      .select(DEL_COBRO)
      .eq('id', id)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return data ? ordenado(data as unknown as CobroGuardado) : null;
  }

  async crearCobro(fila: {
    company_id: number;
    quotation_id: string | null;
    descripcion: string;
    total: number;
    creado_por: string | null;
    creado_por_nombre: string | null;
  }) {
    this.logger.info(`nuevo cobro por boletear (empresa ${fila.company_id})`);
    const { data, error } = await this.supabase.client
      .from('cobros_por_boletear')
      .insert([fila])
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: number }).id;
  }

  async editarCobro(
    id: number,
    companyId: number,
    cambios: { descripcion?: string; total?: number },
  ) {
    this.logger.info(`edita el cobro por boletear ${id}`);
    const { error } = await this.supabase.client
      .from('cobros_por_boletear')
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
  }

  async borrarCobro(id: number, companyId: number) {
    this.logger.info(`borra el cobro por boletear ${id}`);
    const { error } = await this.supabase.client
      .from('cobros_por_boletear')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId);
    if (error) throw error;
  }

  async agregarLinea(fila: {
    company_id: number;
    cobro_id: number;
    cabana: string;
    monto: number;
    correo: string | null;
    creado_por: string | null;
  }) {
    this.logger.info(`nueva cabaña en el cobro ${fila.cobro_id}`);
    const { data, error } = await this.supabase.client
      .from('cobros_por_boletear_lineas')
      .insert([fila])
      .select('id')
      .single();
    if (error) throw error;
    return (data as { id: number }).id;
  }

  async editarLinea(
    id: number,
    cobroId: number,
    companyId: number,
    cambios: {
      cabana?: string;
      monto?: number;
      correo?: string | null;
      documento_id?: number | null;
    },
  ) {
    this.logger.info(`edita la cabaña ${id} del cobro ${cobroId}`);
    const { error } = await this.supabase.client
      .from('cobros_por_boletear_lineas')
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('cobro_id', cobroId)
      .eq('company_id', companyId);
    if (error) throw error;
  }

  async quitarLinea(id: number, cobroId: number, companyId: number) {
    this.logger.info(`quita la cabaña ${id} del cobro ${cobroId}`);
    const { error } = await this.supabase.client
      .from('cobros_por_boletear_lineas')
      .delete()
      .eq('id', id)
      .eq('cobro_id', cobroId)
      .eq('company_id', companyId)
      .is('documento_id', null);
    if (error) throw error;
  }

  /** El tarifario de la empresa, en su orden. */
  async tarifario(companyId: number) {
    const { data, error } = await this.supabase.client
      .from('tarifario_de_boletas')
      .select('id, nombre, precio, unidad, activo, orden')
      .eq('company_id', companyId)
      .order('orden', { ascending: true })
      .order('id', { ascending: true });
    if (error) throw error;
    return ((data ?? []) as ItemDelTarifario[]).map((i) => ({
      ...i,
      precio: Number(i.precio),
    }));
  }

  async crearItem(fila: {
    company_id: number;
    nombre: string;
    precio: number;
    unidad: string;
    creado_por: string | null;
  }) {
    this.logger.info(`nuevo ítem del tarifario (empresa ${fila.company_id})`);
    const { error } = await this.supabase.client
      .from('tarifario_de_boletas')
      .insert([fila]);
    if (error) throw error;
  }

  async editarItem(
    id: number,
    companyId: number,
    cambios: Partial<Omit<ItemDelTarifario, 'id'>>,
  ) {
    this.logger.info(`edita el ítem ${id} del tarifario`);
    const { data, error } = await this.supabase.client
      .from('tarifario_de_boletas')
      .update({ ...cambios, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('company_id', companyId)
      .select('id');
    if (error) throw error;
    return (data ?? []).length;
  }

  async borrarItem(id: number, companyId: number) {
    this.logger.info(`borra el ítem ${id} del tarifario`);
    const { data, error } = await this.supabase.client
      .from('tarifario_de_boletas')
      .delete()
      .eq('id', id)
      .eq('company_id', companyId)
      .select('id');
    if (error) throw error;
    return (data ?? []).length;
  }

  /** El nombre de la persona en su perfil, el mismo con que firma la
   *  bitácora (`QuotationFollowupsRepository.nombreDeLaPersona`). */
  async nombreDeLaPersona(
    companyId: number,
    userId: string,
  ): Promise<string | null> {
    const { data, error } = await this.supabase.client
      .from('user_profiles')
      .select('full_name')
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .maybeSingle();
    if (error) throw error;
    return (
      (data as { full_name: string | null } | null)?.full_name?.trim() || null
    );
  }

  /** La boleta no salió («Comprobar»): su cabaña vuelve a quedar por
   *  emitir. */
  async desamarrarDeLaBoleta(documentoId: number, companyId: number) {
    const { error } = await this.supabase.client
      .from('cobros_por_boletear_lineas')
      .update({ documento_id: null, updated_at: new Date().toISOString() })
      .eq('documento_id', documentoId)
      .eq('company_id', companyId);
    if (error) throw error;
  }

  /** E3: quién cambió qué. Solo se agrega. */
  async anotar(cambios: NuevoCambio[]) {
    if (!cambios.length) return;
    const { error } = await this.supabase.client
      .from('cobros_por_boletear_cambios')
      .insert(cambios);
    if (error) throw error;
  }

  /** Las boletas de un día (control de la casa: el SII ya no pide el
   *  resumen diario, L18), con la cabaña si vienen de un cobro. Las «por
   *  confirmar» no tienen fecha de emisión: salen todas, hasta que se
   *  comprueben (L5). `fecha` es AAAA-MM-DD de Chile. */
  async boletasDelDia(companyId: number, fecha: string) {
    const { data, error } = await this.supabase.client
      .from('documentos_tributarios')
      .select(
        'id, folio, estado, ambiente, total, receptor, detalle, pdf_path, emitido_en, created_at, quotation_id, lineas:cobros_por_boletear_lineas(cabana, cobro_id)',
      )
      .eq('company_id', companyId)
      .eq('tipo', 39)
      .or(
        `estado.eq.por_confirmar,and(estado.eq.emitido,fecha_emision.eq.${fecha})`,
      )
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as unknown as {
      id: number;
      folio: number | null;
      estado: string;
      ambiente: string;
      total: number;
      receptor: { correo?: string | null };
      detalle: { descripcion?: string }[];
      pdf_path: string | null;
      emitido_en: string | null;
      created_at: string;
      quotation_id: string | null;
      lineas: { cabana: string; cobro_id: number }[];
    }[];
  }
}
