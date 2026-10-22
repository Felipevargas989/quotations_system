import {
  BadRequestException,
  HttpException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { ClientsService } from 'src/clients/clients.service';
import type { CreateClientDto } from 'src/clients/dto/create-client.dto';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { QuotationFollowupsService } from 'src/quotation-followups/quotation-followups.service';
import type { CreateQuotationDto } from 'src/quotations/dto/create-quotation.dto';
import type { UpdateQuotationDto } from 'src/quotations/dto/update-quotation.dto';
import { armarFoto } from 'src/quotations/generar/armar-foto';
import { pesos } from 'src/quotations/generar/catalogo';
import { GenerarRepository } from 'src/quotations/generar/generar.repository';
import { ofrecible } from 'src/quotations/generar/reglas-valle-del-sol';
import { QuotationsService } from 'src/quotations/quotations.service';
import { computeMoney } from 'src/quotations/utils/money';
import type { User } from 'src/users/entities/user.entity';
import { AnalisisRepository } from '../analisis/analisis.repository';
import {
  leerOferta,
  type OfertaDeLaPropuesta,
  productosDeLaOferta,
} from '../generacion/oferta-de-la-propuesta';
import { listaDeTextos } from './armar-la-oferta';
import {
  bloqueDeLaLicitacion,
  comentarioConLaLicitacion,
} from './comentario-de-la-licitacion';
import { noSiEstaCongelada } from './congelada';
import {
  type CotizacionDeLaPostulacion,
  type OportunidadParaCotizar,
  PostulacionRepository,
} from './postulacion.repository';

// LA COTIZACIÓN DE LA POSTULACIÓN Y «¿CALZA EL PRECIO?» (decisión 29 del
// doc 17, 19-10). Felipe:
//  - "lo que traigo del catálogo es lo que debe vaciarse en la nueva
//    cotización o en la cotización que se vincula, porque tienen que ser
//    equivalentes": la cotización se arma con la oferta que dejó la
//    propuesta técnica, con armarFoto y los precios del catálogo;
//  - "vincular solamente el número y reescribir todo": una cotización que
//    ya existe se reescribe entera, con lo que tenía anotado en su bitácora
//    (nada se borra); una aceptada o realizada no, porque ya es un evento;
//  - "si existe diferencia de precio respecto a lo ofertado, se ajusta como
//    un descuento en dinero, así cuadramos al peso": la oferta es el total
//    de la cotización, y la diferencia con el catálogo, su descuento.
//
// DESDE LA DECISIÓN 69 (22-10, el catamarán). Felipe: "por un tema de una
// diferencia de plata no estamos creando la cotización con lo básico...
// yo después me voy y a mano pongo servicio de catamarán, lo agrego, y
// cuadro los precios". La cotización se crea SIEMPRE con lo que la empresa
// tiene en su catálogo: si la oferta es mayor (lleva lo que se subcontrata),
// queda al precio del catálogo, la diferencia se anota y «¿Calza el
// precio?» la muestra en rojo con la lista de lo que falta. Al crearla se
// eligen las fechas (desde–hasta), con las de las bases propuestas. Y deja
// de ser de solo lectura: se le agrega a mano lo que falta; «Armar
// postulación» ya no la reescribe sola, se reescribe con un botón.

const NO_SE_REESCRIBE = ['aceptada', 'realizada'];

export type ResumenDeLaCotizacion = {
  id: string;
  numero: number;
  estado: string;
  cliente: string | null;
  /** Lo que vale con los precios del catálogo. */
  catalogo: number;
  descuento: number;
  /** La oferta: lo que la cotización cobra. */
  total: number;
};

export type EstadoDeLaCotizacion = {
  cotizacion: ResumenDeLaCotizacion | null;
  /** El presupuesto de la licitación: el publicado o el de las bases. */
  presupuesto: number | null;
  /** La última propuesta técnica lista y cuántos productos ofrece; null si
   *  no hay, o si es de antes de que dejara su oferta. */
  propuesta: { id: number; productos: number } | null;
  /** Lo que la oferta subcontrata o no tiene en el catálogo: lo que falta
   *  en la cotización (decisión 69). */
  faltan: string[];
  /** Las fechas que se proponen al crear la cotización; null sin oferta. */
  fechas: FechasDeLaCotizacion | null;
};

/** Desde y hasta, AAAA-MM-DD; `hasta` null = un solo día. */
export type FechasDeLaCotizacion = { desde: string; hasta: string | null };

const entero = (v: unknown): number => {
  const x = Number(v);
  return Number.isFinite(x) && x > 0 ? Math.round(x) : 0;
};

const fechaIso = (v: unknown): string | null =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;

/** AAAA-MM-DD más n días (al mediodía UTC: sin saltos de zona horaria). */
export const sumarDias = (iso: string, n: number): string => {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** Cuántos días dura lo que se ofrece: el día más alto de las cajas y los
 *  fijos (0 en un fijo = todo el evento). */
export const diasDeLaOferta = (oferta: OfertaDeLaPropuesta): number =>
  Math.max(
    1,
    ...oferta.cajas.map((c) => c.dia),
    ...oferta.fijos.map((f) => f.dia),
  );

/** Lo que tenía una cotización antes de reescribirla, para su bitácora. */
export const loQueTenia = (items: Record<string, unknown> | null): string => {
  const cajas = (items?.variable_services ?? []) as Array<{
    category?: string;
    people?: number;
    items?: Array<{ nombre?: string; quantity?: number }>;
  }>;
  const fijos = (items?.fixed_services ?? []) as Array<{
    nombre?: string;
    quantity?: number;
  }>;
  const conCantidad = (x: { nombre?: string; quantity?: number }) =>
    `${x.nombre ?? '?'}${(x.quantity ?? 1) > 1 ? ` x${x.quantity}` : ''}`;
  const partes = [
    ...cajas.map(
      (c) =>
        `${c.category ?? 'Caja'} (${c.people ?? '?'} pers.): ${(c.items ?? []).map(conCantidad).join(', ')}`,
    ),
    ...(fijos.length > 0
      ? [`Fijos: ${fijos.map(conCantidad).join(', ')}`]
      : []),
  ];
  const texto = partes.join(' · ') || 'sin productos';
  return texto.length > 1400 ? `${texto.slice(0, 1400)}…` : texto;
};

/** El tipo de evento de la cotización: la base acepta solo los de la casa
 *  (quotations_event_type_check, el mismo en producción y en el
 *  laboratorio). Sale del nombre de la licitación y de lo que leyó la IA;
 *  si no calza nada, «Celebraciones». Lo vio el QA del 19-10: «Licitación»
 *  no es un tipo. */
export const tipoDeEvento = (
  nombre: string,
  etiquetas: readonly string[] = [],
): string => {
  const texto = `${nombre} ${etiquetas.join(' ')}`.toLowerCase();
  if (/celebraci|ceremonia|aniversario|d[ií]a del|fiesta|gala/.test(texto)) {
    return 'Celebraciones';
  }
  if (/alojamiento|estad[ií]a|hospedaje/.test(texto)) {
    return 'Estadía y Alimentación';
  }
  if (/paseo|gira|salida pedag/.test(texto)) {
    return /curso|estudi|alumn|escolar|liceo|colegio/.test(texto)
      ? 'Paseo de Curso'
      : 'Paseo fin de año';
  }
  if (/capacitaci|jornada|seminario|taller|sal[oó]n/.test(texto)) {
    return 'Uso salones';
  }
  if (/almuerzo|cena|alimentaci|coffee|c[oó]ctel|banquete/.test(texto)) {
    return 'Almuerzo o Cena';
  }
  return 'Celebraciones';
};

/** El nombre del comprador como cliente: sin el "I." ni el "Ilustre". */
export const nombreDelComprador = (organismo: string): string =>
  organismo.replace(/^\s*(ilustre|i\.?)\s+(?=municipalidad)/i, '').trim();

@Injectable()
export class CotizacionDeLaPostulacionService {
  constructor(
    private readonly repo: PostulacionRepository,
    private readonly analisis: AnalisisRepository,
    private readonly catalogos: GenerarRepository,
    private readonly cotizaciones: QuotationsService,
    private readonly clientes: ClientsService,
    private readonly bitacora: QuotationFollowupsService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(CotizacionDeLaPostulacionService.name);
  }

  async estado(
    companyId: number,
    oportunidadId: number,
  ): Promise<EstadoDeLaCotizacion> {
    const o = await this.oportunidad(companyId, oportunidadId);
    const [propuesta, analisis, cotizacion] = await Promise.all([
      this.ofertaDeLaPropuesta(companyId, oportunidadId),
      this.analisis.ultimo(companyId, oportunidadId),
      o.quotation_id
        ? this.repo.cotizacion(companyId, { id: o.quotation_id })
        : Promise.resolve(null),
    ]);
    const deLasBases =
      analisis?.estado === 'listo' ? entero(analisis.resultado?.monto) : 0;
    const sugerido = propuesta
      ? await this.evento(companyId, o, propuesta.oferta, null)
      : null;
    return {
      cotizacion: cotizacion ? this.resumen(cotizacion) : null,
      presupuesto: entero(o.proceso.monto) || deLasBases || null,
      propuesta: propuesta
        ? { id: propuesta.id, productos: productosDeLaOferta(propuesta.oferta) }
        : null,
      faltan: propuesta?.subcontratar ?? [],
      fechas: sugerido ? { desde: sugerido.fecha, hasta: sugerido.fin } : null,
    };
  }

  /** Crear o reescribir la cotización con lo postulado. Con `numero`, se
   *  vincula esa; sin él, la ya vinculada; y si no hay ninguna, se crea.
   *  Con `total` (el precio de «Armar postulación», decisión 35), queda
   *  además con ese precio. Desde ahí es de solo lectura en el cotizador. */
  async llevar(
    user: User,
    oportunidadId: number,
    numero?: number,
    total?: number,
    fechas?: Partial<FechasDeLaCotizacion>,
  ): Promise<EstadoDeLaCotizacion> {
    try {
      const estado = await this.llevarSinCapturar(
        user,
        oportunidadId,
        numero,
        fechas,
      );
      return total
        ? await this.fijarOferta(user, oportunidadId, total)
        : estado;
    } catch (error) {
      // Lo que no es de la casa (un dato raro, la base) se dice en palabras
      // y queda en el registro, en vez de un 500 mudo.
      if (error instanceof HttpException) throw error;
      this.logger.error(
        `cotización de la oportunidad ${oportunidadId}: ${mensajeDe(error)} ${error instanceof Error ? error.stack : ''}`,
      );
      throw new UnprocessableEntityException(
        `No se pudo armar la cotización: ${mensajeDe(error)}`,
      );
    }
  }

  private async llevarSinCapturar(
    user: User,
    oportunidadId: number,
    numero?: number,
    fechas?: Partial<FechasDeLaCotizacion>,
  ): Promise<EstadoDeLaCotizacion> {
    const companyId = user.company_id;
    const o = await this.oportunidad(companyId, oportunidadId);
    noSiEstaCongelada(o.estado);
    const propuesta = await this.ofertaDeLaPropuesta(companyId, oportunidadId);
    if (!propuesta) {
      throw new BadRequestException(
        'Primero arma la postulación («Armar postulación», arriba): de ella salen los productos de la cotización.',
      );
    }
    const destino = numero
      ? await this.repo.cotizacion(companyId, { numero })
      : o.quotation_id
        ? await this.repo.cotizacion(companyId, { id: o.quotation_id })
        : null;
    if (numero && !destino) {
      throw new NotFoundException(`No hay una cotización N° ${numero}.`);
    }
    if (destino && NO_SE_REESCRIBE.includes(destino.quotation_status)) {
      throw new BadRequestException(
        `La N° ${destino.quotation_number} está ${destino.quotation_status}: no se reescribe un evento confirmado.`,
      );
    }

    const evento = await this.evento(
      companyId,
      o,
      propuesta.oferta,
      destino,
      fechas,
    );
    const catalogo = await this.catalogos.catalogo(companyId);
    const armado = armarFoto(
      {
        ...propuesta.oferta,
        // El último día, para que lo ofrecido de varios días calce (con ''
        // armarFoto contaba un solo día y rechazaba el día 2 en adelante:
        // el catamarán y el Profesor, 22-10, decisión 69).
        ultimo_dia: evento.fin ?? '',
        descuento_porcentaje: 0,
        presupuesto_cliente: { monto: 0, por: 'total' },
        nota: '',
      },
      catalogo,
      { ...evento, ninos: 0, esTourOperador: false },
      ofrecible,
    );
    if (!armado.ok) {
      throw new BadRequestException(
        `Los productos de lo postulado no calzan con el catálogo: ${armado.errores.slice(0, 3).join(' · ')}. Vuelve a armar la postulación.`,
      );
    }
    const plata = this.plata(armado.items, evento.personas, 0);
    const origen = `la propuesta técnica de la licitación ${o.codigo} (${o.proceso.nombre})`;
    // Decisión 57: los detalles de lo postulado y el pedido al proveedor,
    // en el comentario interno (lo demás que tenga, se queda).
    const bloque = bloqueDeLaLicitacion({
      codigo: o.codigo,
      nombre: o.proceso.nombre,
      detalles: propuesta.detalles,
      subcontratar: propuesta.subcontratar,
    });

    let quotationId: string;
    if (destino) {
      await this.cotizaciones.update(
        destino.id,
        {
          ...plata,
          people_count: evento.personas,
          // Las fechas, solo si se eligieron al reescribir (decisión 69).
          ...(fechas?.desde
            ? { event_date: evento.fecha, event_end_date: evento.fin }
            : {}),
          comentario_interno: comentarioConLaLicitacion(
            destino.comentario_interno,
            bloque,
            o.codigo,
          ),
        } as UpdateQuotationDto,
        companyId,
        user.role,
        { derechos: user.derechos, plan: user.plan },
      );
      await this.anotar(
        user,
        destino.id,
        `Se reescribió con ${origen}. Antes tenía: ${loQueTenia(destino.items)} (${pesos(destino.total_amount ?? 0)}).`,
      );
      quotationId = destino.id;
    } else {
      const cliente = await this.clienteDelComprador(
        companyId,
        o.proceso.organismo,
      );
      const nueva = (await this.cotizaciones.create(
        {
          ...plata,
          client_id: cliente,
          event_type: tipoDeEvento(o.proceso.nombre, o.etiquetas ?? []),
          event_date: evento.fecha,
          event_end_date: evento.fin,
          people_count: evento.personas,
          children_count: 0,
          quotation_status: 'solicitada',
          comentario_interno: bloque,
        } as unknown as CreateQuotationDto,
        companyId,
        user.id,
        {
          derechos: user.derechos,
          cotizaciones_mes: user.cotizaciones_mes,
          plan: user.plan,
        },
      )) as { id: string };
      await this.anotar(user, nueva.id, `Creada desde ${origen}.`);
      quotationId = nueva.id;
    }
    await this.repo.vincular(companyId, oportunidadId, quotationId);
    return this.estado(companyId, oportunidadId);
  }

  /** La oferta de la postulación: el total de la cotización. La diferencia
   *  con el catálogo entra como descuento en dinero. */
  async fijarOferta(
    user: User,
    oportunidadId: number,
    total: number,
  ): Promise<EstadoDeLaCotizacion> {
    const companyId = user.company_id;
    const o = await this.oportunidad(companyId, oportunidadId);
    noSiEstaCongelada(o.estado);
    const q = o.quotation_id
      ? await this.repo.cotizacion(companyId, { id: o.quotation_id })
      : null;
    if (!q) {
      throw new BadRequestException(
        'Primero crea o vincula la cotización de la postulación.',
      );
    }
    if (NO_SE_REESCRIBE.includes(q.quotation_status)) {
      throw new BadRequestException(
        `La N° ${q.quotation_number} está ${q.quotation_status}: su precio ya no se cambia.`,
      );
    }
    const catalogo = computeMoney({
      items: q.items as never,
      people_count: q.people_count,
      children_count: q.children_count ?? 0,
      discount_percentage: 0,
      discount_amount: 0,
      tip_percentage: null,
    }).subtotalAmount;
    if (total > catalogo) {
      // La oferta lleva lo que se subcontrata o no está en el catálogo
      // (decisión 69): la cotización queda con lo que hay, a precio de
      // catálogo, y la diferencia se anota. Nunca un precio a dedo: lo que
      // falta se agrega a mano, como servicio, para cuadrar.
      await this.anotar(
        user,
        q.id,
        `Oferta de la licitación ${o.codigo}: ${pesos(total)}. Tu catálogo suma ${pesos(catalogo)}: faltan ${pesos(total - catalogo)} en la cotización (lo que se subcontrata o no está en tu catálogo; la lista está en el comentario interno). Agrégalo para cuadrar.`,
      );
      return this.estado(companyId, oportunidadId);
    }
    const descuento = catalogo - total;
    await this.cotizaciones.update(
      q.id,
      this.plata(q.items, q.people_count, descuento, q.children_count ?? 0),
      companyId,
      user.role,
      { derechos: user.derechos, plan: user.plan },
    );
    const porcentaje =
      catalogo > 0 ? Math.round((descuento / catalogo) * 1000) / 10 : 0;
    await this.anotar(
      user,
      q.id,
      `Oferta de la licitación ${o.codigo}: ${pesos(total)}. Descuento de ${pesos(descuento)} (${porcentaje.toLocaleString('es-CL')} %) sobre el catálogo (${pesos(catalogo)}).`,
    );
    return this.estado(companyId, oportunidadId);
  }

  // ------------------------------------------------------------

  private async oportunidad(
    companyId: number,
    id: number,
  ): Promise<OportunidadParaCotizar> {
    const o = await this.repo.oportunidad(companyId, id);
    if (!o) throw new NotFoundException('Oportunidad no encontrada.');
    return o;
  }

  private async ofertaDeLaPropuesta(
    companyId: number,
    oportunidadId: number,
  ): Promise<{
    id: number;
    oferta: OfertaDeLaPropuesta;
    detalles: string[];
    subcontratar: string[];
  } | null> {
    const p = await this.repo.ultimaPropuesta(companyId, oportunidadId);
    const oferta = leerOferta(p?.resultado?.oferta);
    return p && oferta
      ? {
          id: p.id,
          oferta,
          detalles: listaDeTextos(p.resultado?.detalles),
          subcontratar: listaDeTextos(p.resultado?.subcontratar),
        }
      : null;
  }

  /** La fecha, el término y las personas. La fecha: la elegida al crear
   *  (decisión 69); si no, la de la cotización que se reescribe; si no, la
   *  de las bases; si no, el cierre. El término: el elegido (si es después
   *  de la fecha); si no, el de la cotización que se reescribe; si no, los
   *  días que dura lo que se ofrece. */
  private async evento(
    companyId: number,
    o: OportunidadParaCotizar,
    oferta: OfertaDeLaPropuesta,
    destino: CotizacionDeLaPostulacion | null,
    elegidas?: Partial<FechasDeLaCotizacion>,
  ): Promise<{ fecha: string; fin: string | null; personas: number }> {
    const analisis = await this.analisis.ultimo(companyId, o.id);
    const bases = analisis?.estado === 'listo' ? analisis.resultado : null;
    const desde = fechaIso(elegidas?.desde);
    const fecha =
      desde ??
      fechaIso(destino?.event_date?.slice(0, 10)) ??
      fechaIso(bases?.fecha_del_servicio_iso) ??
      fechaIso(o.proceso.fecha_cierre?.slice(0, 10)) ??
      new Date().toISOString().slice(0, 10);
    const despues = (v: string | null) => (v && v > fecha ? v : null);
    // Lo ofrecido de varios días necesita al menos esos días: el término
    // nunca queda antes (si se eligió uno más corto, se alarga).
    const dias = diasDeLaOferta(oferta);
    const necesario = dias > 1 ? sumarDias(fecha, dias - 1) : null;
    const pedido = desde
      ? despues(fechaIso(elegidas?.hasta))
      : destino
        ? despues(fechaIso(destino.event_end_date?.slice(0, 10)))
        : null;
    const fin =
      necesario && (!pedido || pedido < necesario) ? necesario : pedido;
    const personas =
      entero(bases?.personas) ||
      Math.max(1, ...oferta.cajas.map((c) => c.personas));
    return { fecha, fin, personas };
  }

  /** Los campos de plata de la cotización, con `computeMoney` (el mismo
   *  cálculo que revisa el motor al guardar). Sin propina: es una
   *  licitación. */
  private plata(
    items: unknown,
    personas: number,
    descuento: number,
    ninos = 0,
  ): UpdateQuotationDto {
    const dinero = computeMoney({
      items: items as never,
      people_count: personas,
      children_count: ninos,
      discount_percentage: 0,
      discount_amount: descuento,
      tip_percentage: null,
    });
    return {
      items: items as UpdateQuotationDto['items'],
      request_type: 'cotizacion',
      value_per_person: dinero.valuePerPerson,
      fixed_value: dinero.fixedTotal,
      subtotal_amount: dinero.subtotalAmount,
      discount_percentage: 0,
      discount_amount: descuento,
      tip_percentage: null,
      tip_amount: 0,
      total_amount: dinero.totalAmount,
    } as UpdateQuotationDto;
  }

  private resumen(q: CotizacionDeLaPostulacion): ResumenDeLaCotizacion {
    const descuento = Number(q.discount_amount) || 0;
    const total = Number(q.total_amount) || 0;
    return {
      id: q.id,
      numero: q.quotation_number,
      estado: q.quotation_status,
      cliente: q.client?.name ?? null,
      catalogo: Number(q.subtotal_amount) || total + descuento,
      descuento,
      total,
    };
  }

  /** El comprador como cliente: el que ya existe con un nombre parecido
   *  (Municipalidad de Quillón), o uno nuevo con el tipo de los públicos. */
  private async clienteDelComprador(
    companyId: number,
    organismo: string | null,
  ): Promise<string> {
    const nombre = nombreDelComprador(organismo || 'Comprador público');
    const parecidos = await this.clientes.coincidencias(
      { name: nombre },
      companyId,
    );
    if (parecidos.length > 0) return parecidos[0].cliente_id;
    const tipos = await this.repo.tiposDeCliente(companyId);
    const tipo =
      tipos.find((t) => /p[uú]blic/i.test(t)) ??
      tipos.find((t) => /empresa/i.test(t)) ??
      'Empresas Publicas';
    const creado = (await this.clientes.create(
      { name: nombre, client_type: tipo } as CreateClientDto,
      companyId,
    )) as { id: string };
    return creado.id;
  }

  private async anotar(user: User, quotationId: string, nota: string) {
    await this.bitacora
      .create(user, { quotation_id: quotationId, tipo: 'otro', note: nota })
      .catch((e: unknown) =>
        this.logger.warn(`no pude anotar en la bitácora: ${mensajeDe(e)}`),
      );
  }
}
