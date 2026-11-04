import { SALES_AND_UP } from 'src/auth/roles.decorator';
import { RequestType } from 'src/quotations/constants/constants';
import type { FichaDeCotizacion } from '../asistente.repository';
import {
  conDia,
  diaDelEvento,
  diasEntre,
  enlaceDe,
  entero,
  ErrorDeHerramienta,
  estadoDe,
  fechaEnChile,
  pesos,
  sumarDias,
  type Herramienta,
} from './comun';

// «¿Qué cena tiene el día 3 de la 500?», «¿qué trae esta cotización?». La
// ficha del negocio: los servicios día por día, la plata y la bitácora. Es
// de quien vende (SECTION_ROLES.quotations_edit). Los pagos no van acá:
// son de operaciones para arriba (fase 1, sprint 3).

type Item = {
  codigo?: string | null;
  nombre?: string | null;
  precio?: number | null;
  quantity?: number | null;
};
type Caja = {
  category?: string | null;
  day?: number | null;
  audience?: string | null;
  people?: number | null;
  items?: Item[] | null;
};
type Fijo = Item & { day?: number | null };
type Foto = {
  variable_services?: Caja[] | null;
  fixed_services?: Fijo[] | null;
};

const n = (v: unknown): number => Number(v) || 0;

/** «Leche asada ×2 (id 812)»: con el id, BelIA propone sacar ese plato
 *  exacto (fase 2). */
const conCantidad = (it: Item): string => {
  const c = n(it.quantity) || 1;
  const id = it.codigo ? ` (id ${it.codigo})` : '';
  return `${it.nombre ?? '?'}${c > 1 ? ` ×${c}` : ''}${id}`;
};

/** Los servicios por día, como los muestra Servicios: cada casilla con su
 *  categoría, para quiénes, su valor por persona y lo que trae. Exportada
 *  para probarla. */
export const diasDe = (foto: Foto, desde: string | null, personas: number) => {
  const cajas = foto.variable_services ?? [];
  const fijos = foto.fixed_services ?? [];
  const dias = new Map<number, { casillas: unknown[]; fijos: unknown[] }>();
  const delDia = (d: number) => {
    if (!dias.has(d)) dias.set(d, { casillas: [], fijos: [] });
    return dias.get(d)!;
  };
  for (const caja of cajas) {
    const items = caja.items ?? [];
    if (items.length === 0) continue;
    const porPersona = items.reduce(
      (s, it) => s + n(it.precio) * (n(it.quantity) || 1),
      0,
    );
    const gente = caja.people == null ? personas : n(caja.people);
    delDia(Math.max(1, n(caja.day) || 1)).casillas.push({
      categoria: caja.category ?? null,
      para: `${gente} ${caja.audience === 'ninos' ? 'niños' : 'adultos'}`,
      por_persona: pesos(porPersona),
      servicios: items.map(conCantidad),
    });
  }
  const delEvento: unknown[] = [];
  for (const f of fijos) {
    const linea = {
      nombre: f.nombre ?? '?',
      id: f.codigo ?? undefined,
      cantidad: n(f.quantity) || 1,
      precio: pesos(n(f.precio)),
    };
    if (n(f.day) >= 1) delDia(n(f.day)).fijos.push(linea);
    else delEvento.push(linea);
  }
  return {
    dias: [...dias.entries()]
      .sort(([a], [b]) => a - b)
      .map(([dia, d]) => ({
        dia,
        fecha: desde ? conDia(sumarDias(desde, dia - 1)) : null,
        casillas: d.casillas,
        fijos: d.fijos.length ? d.fijos : undefined,
      })),
    fijos_de_todo_el_evento: delEvento,
  };
};

export const fichaComoLaVePersona = (
  q: FichaDeCotizacion,
  rol: Parameters<typeof enlaceDe>[1],
) => {
  const desde = diaDelEvento(q.event_date);
  const hasta = diaDelEvento(q.event_end_date);
  const personas = n(q.people_count);
  const ninos = n(q.children_count);
  return {
    numero: q.quotation_number,
    enlace: enlaceDe(q, rol),
    estado: estadoDe(q.quotation_status),
    tipo:
      q.request_type === RequestType.REQUERIMIENTO
        ? 'requerimiento'
        : 'cotización',
    cliente: q.clients
      ? {
          nombre: q.clients.name,
          tipo: q.clients.client_type,
          correo: q.clients.email,
          telefono: q.clients.phone,
        }
      : null,
    contacto: q.mandante
      ? {
          nombre: q.mandante.name,
          correo: q.mandante.email,
          telefono: q.mandante.phone,
        }
      : q.contact_name
        ? { nombre: q.contact_name }
        : null,
    evento: {
      tipo: q.event_type,
      desde: conDia(desde),
      hasta: conDia(hasta),
      dias: desde && hasta ? diasEntre(desde, hasta) + 1 : 1,
    },
    personas: {
      total: personas,
      adultos: Math.max(0, personas - ninos),
      ninos,
    },
    plata: {
      subtotal: pesos(q.subtotal_amount),
      descuento:
        n(q.discount_amount) > 0
          ? `${pesos(q.discount_amount)}${n(q.discount_percentage) > 0 ? ` (${n(q.discount_percentage)} %)` : ''}`
          : undefined,
      propina: n(q.tip_amount) > 0 ? pesos(q.tip_amount) : undefined,
      total: pesos(q.total_amount),
      valor_por_persona: pesos(q.value_per_person),
      nota: 'Los totales de Eventia ya incluyen IVA.',
    },
    ...diasDe((q.items ?? {}) as Foto, desde, personas),
    observaciones_que_salen_en_el_pdf: q.observations || undefined,
    comentario_interno: q.comentario_interno || undefined,
    motivo_de_perdida: q.loss_reason || undefined,
    enviada: q.sent_at ? fechaEnChile(q.sent_at) : undefined,
    creada: fechaEnChile(q.created_at),
  };
};

type Nota = {
  created_at: string;
  author_name?: string | null;
  tipo?: string | null;
  note?: string | null;
  next_contact_date?: string | null;
  next_contact_done_at?: string | null;
};

export const verCotizacion: Herramienta = {
  nombre: 'ver_cotizacion',
  descripcion:
    'La ficha completa de una cotización: cliente, contacto, fechas, personas, los servicios ' +
    'día por día (cada casilla con su valor por persona), los fijos, la plata y las últimas ' +
    'notas de la bitácora. Sin `numero`, la que la persona tiene abierta en la pantalla.',
  esquema: {
    type: 'object',
    properties: {
      numero: { type: 'integer', description: 'El N° de la cotización.' },
    },
  },
  cargos: SALES_AND_UP,
  async ejecutar(entrada, ctx) {
    const numero = entero(entrada.numero, 1, 10_000_000);
    if (!numero && !ctx.cotizacionAbierta) {
      throw new ErrorDeHerramienta(
        'Falta el N°: la persona no tiene ninguna cotización abierta.',
      );
    }
    const empresa = ctx.usuario.company_id;
    const q = await ctx.repositorio.fichaDeCotizacion(
      empresa,
      numero ? { numero } : { id: ctx.cotizacionAbierta! },
    );
    if (!q) {
      throw new ErrorDeHerramienta(
        `No hay ninguna cotización N° ${numero ?? '(abierta)'} en esta empresa.`,
      );
    }
    const notas = ((await ctx.bitacora.findByQuotation(empresa, q.id)) ??
      []) as Nota[];
    const recientes = [...notas]
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
      .slice(0, 8)
      .map((f) => ({
        cuando: fechaEnChile(f.created_at),
        autor: f.author_name ?? undefined,
        canal: f.tipo ?? undefined,
        nota: (f.note ?? '').slice(0, 500),
        proximo_contacto: f.next_contact_date ?? undefined,
        cumplido: f.next_contact_done_at ? true : undefined,
      }));
    return {
      ...fichaComoLaVePersona(q, ctx.usuario.role),
      bitacora: recientes,
      notas_en_total: notas.length,
    };
  },
};
