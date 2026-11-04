import { OPERATIONS_AND_UP } from 'src/auth/roles.decorator';
import {
  buildConsolidationContext,
  consolidateEvent,
  grossQty,
  mapNameIds,
  newAccumulator,
  type EventItemsSnapshot,
  type LineaDeReceta,
  type MuebleBase,
} from 'src/logistics/utils/consolidacion';
import { QuotationStatus } from 'src/quotations/constants/constants';
import { normal } from './buscar-en-catalogo';
import {
  ErrorDeHerramienta,
  conDia,
  diaDelEvento,
  enlaceDe,
  entero,
  estadoDe,
  fecha,
  pesos,
  texto,
  type Herramienta,
} from './comun';

// «¿Cuánta carne mechada necesito?», «¿qué falta comprar esta semana?». Lo
// que piden los eventos aceptados con la MISMA cuenta de la pantalla de
// Compras (logistics/utils/consolidacion.ts, que la app importa con el alias
// @consolidacion; antes solo vivía en la app y BelIA mandaba a Compras):
// - los mismos eventos: aceptados, por la fecha del evento, desde hoy;
// - las mismas personas: las del evento (people_count);
// - la misma regla de lo comprado: un insumo de un evento está comprado si
//   Compras lo provisionó para ese evento;
// - la cantidad en neto y la merma solo en el costo (regla del 22-07).
// Es de operaciones para arriba con el derecho `logistica`, como Compras.
// Eventia no lleva el stock de bodega de los insumos: esto es lo que piden
// los eventos, no lo que hay.

const UNIDAD: Record<string, string> = {
  masa: 'kg',
  volumen: 'L',
  unidad: 'u',
};

const MAX_INSUMOS = 60;
const MAX_EVENTOS = 30;

const n = (v: unknown): number => Number(v) || 0;

const cantidad = (v: number, unidad: string): string =>
  `${v.toLocaleString('es-CL', { maximumFractionDigits: 2 })} ${unidad}`;

type Insumo = {
  id: number;
  name: string;
  unit_family: string | null;
  price: number;
  waste_pct: number;
  supplier_id: number | null;
};
type Evento = {
  id: string;
  quotation_number: number;
  event_date: string | null;
  event_end_date: string | null;
  people_count: number | null;
  items: EventItemsSnapshot | null;
  clients: { name: string | null } | null;
};
type Compra = { quotation_id: string; supply_id: number };

export const loQueHayQueComprar: Herramienta = {
  nombre: 'lo_que_hay_que_comprar',
  descripcion:
    'Lo que necesitan los eventos aceptados, con la misma cuenta de la pantalla de Compras: por ' +
    'insumo, cuánto piden (en neto; la merma va solo en el costo), cuánto falta comprar, el costo ' +
    'estimado de lo que falta y qué cotizaciones lo piden (✓ = ya comprado para esa). Por defecto, ' +
    'los eventos desde hoy; con `hasta`, hasta ese día; con `numero`, un solo evento; con `texto`, ' +
    'solo los insumos que calzan. Para «¿cuánta carne mechada necesito/tengo?» o «¿qué falta ' +
    'comprar esta semana?».',
  esquema: {
    type: 'object',
    properties: {
      texto: {
        type: 'string',
        description: 'Parte del nombre del insumo (opcional).',
      },
      numero: {
        type: 'integer',
        description: 'El N° de un evento aceptado (opcional).',
      },
      desde: {
        type: 'string',
        description: 'Eventos desde este día (AAAA-MM-DD). Por defecto, hoy.',
      },
      hasta: {
        type: 'string',
        description:
          'Eventos hasta este día (AAAA-MM-DD). Por defecto, sin tope.',
      },
    },
  },
  cargos: OPERATIONS_AND_UP,
  derecho: 'logistica',
  async ejecutar(entrada, ctx) {
    const empresa = ctx.usuario.company_id;
    const numero = entero(entrada.numero, 1, 10_000_000);
    const buscado = texto(entrada.texto, 80);
    // Con un N° no hay rango: es ese evento, sea cuando sea.
    const desde = numero
      ? undefined
      : (fecha(entrada.desde, 'desde') ?? ctx.hoy);
    const hasta = numero ? undefined : fecha(entrada.hasta, 'hasta');

    if (numero) {
      const q = await ctx.repositorio.cotizacionPorNumero(empresa, numero);
      if (!q) {
        throw new ErrorDeHerramienta(
          `No hay ninguna cotización N° ${numero} en esta empresa.`,
        );
      }
      if (q.quotation_status !== QuotationStatus.ACEPTADA) {
        throw new ErrorDeHerramienta(
          `La N° ${numero} está ${estadoDe(q.quotation_status).toLowerCase()}: Compras calcula solo los eventos aceptados.`,
        );
      }
    }

    const [recetas, insumos, nombres, eventos, compras] = await Promise.all([
      ctx.logistica.findAllRecipeItems(empresa),
      ctx.logistica.findAllSupplies(empresa),
      ctx.logistica.catalogServiceNames(empresa),
      ctx.logistica.findAcceptedEvents(empresa),
      ctx.logistica.findSupplyProvisions(empresa),
    ]);
    const lista = (insumos as unknown as Insumo[]).map((i) => ({
      ...i,
      price: n(i.price),
      waste_pct: n(i.waste_pct),
    }));
    const cuenta = buildConsolidationContext<Insumo, MuebleBase>(
      (recetas as unknown as LineaDeReceta[]).map((r) => ({
        ...r,
        qty_per_person: n(r.qty_per_person),
      })),
      lista,
      [],
      mapNameIds(nombres as Parameters<typeof mapNameIds>[0]),
      {},
    );

    // Los eventos, con el filtro de Compras: la fecha del evento en el
    // rango; sin fecha, solo si no hay rango.
    const elegidos = (eventos as unknown as Evento[]).filter((e) => {
      if (numero) return e.quotation_number === numero;
      if (!e.event_date) return !desde && !hasta;
      const d = e.event_date.slice(0, 10);
      if (desde && d < desde) return false;
      if (hasta && d > hasta) return false;
      return true;
    });

    const comprado = new Map<string, Set<number>>();
    for (const c of compras as unknown as Compra[]) {
      const s = comprado.get(c.quotation_id) ?? new Set<number>();
      s.add(Number(c.supply_id));
      comprado.set(c.quotation_id, s);
    }

    const porInsumo = new Map<
      number,
      {
        necesitan: number;
        falta: number;
        costoFalta: number;
        pedidos: string[];
      }
    >();
    const sinReceta = new Set<string>();
    const insumoDe = new Map(lista.map((i) => [i.id, i]));
    for (const e of elegidos) {
      const acc = newAccumulator<Insumo>();
      const r = consolidateEvent(e.items, e.people_count || 0, cuenta, acc);
      acc.noRecipe.forEach((s) => sinReceta.add(s));
      for (const [id, neta] of r.supplyUse) {
        const insumo = insumoDe.get(id);
        if (!insumo) continue;
        const ya = comprado.get(e.id)?.has(id) ?? false;
        const fila = porInsumo.get(id) ?? {
          necesitan: 0,
          falta: 0,
          costoFalta: 0,
          pedidos: [],
        };
        fila.necesitan += neta;
        if (!ya) {
          fila.falta += neta;
          fila.costoFalta += grossQty(neta, insumo) * insumo.price;
        }
        const unidad = UNIDAD[insumo.unit_family ?? ''] ?? '';
        fila.pedidos.push(
          `N° ${e.quotation_number} (${cantidad(neta, unidad)})${ya ? ' ✓' : ''}`,
        );
        porInsumo.set(id, fila);
      }
    }

    const q = buscado ? normal(buscado) : null;
    const filas = [...porInsumo.entries()]
      .map(([id, f]) => ({ insumo: insumoDe.get(id)!, ...f }))
      .filter((f) => !q || normal(f.insumo.name).includes(q))
      .sort(
        (a, b) =>
          b.costoFalta - a.costoFalta ||
          a.insumo.name.localeCompare(b.insumo.name),
      );

    return {
      eventos: {
        rango: numero
          ? `la N° ${numero}`
          : `${conDia(desde)} ${hasta ? `a ${conDia(hasta)}` : 'en adelante'}`,
        aceptados: elegidos.length,
        lista: elegidos.slice(0, MAX_EVENTOS).map((e) => ({
          numero: e.quotation_number,
          enlace: enlaceDe(
            { id: e.id, quotation_status: QuotationStatus.ACEPTADA },
            ctx.usuario.role,
          ),
          cliente: e.clients?.name ?? null,
          fecha: conDia(diaDelEvento(e.event_date)),
          personas: e.people_count ?? 0,
        })),
      },
      falta_comprar_en_total: pesos(
        filas.reduce((s, f) => s + f.costoFalta, 0),
      ),
      insumos: filas.slice(0, MAX_INSUMOS).map((f) => {
        const unidad = UNIDAD[f.insumo.unit_family ?? ''] ?? '';
        return {
          insumo: f.insumo.name,
          necesitan: cantidad(f.necesitan, unidad),
          falta_comprar:
            f.falta > 0 ? cantidad(f.falta, unidad) : 'nada: ya comprado',
          costo_de_lo_que_falta: f.falta > 0 ? pesos(f.costoFalta) : undefined,
          lo_piden: f.pedidos.slice(0, 12),
        };
      }),
      insumos_mostrados: Math.min(MAX_INSUMOS, filas.length),
      insumos_en_total: filas.length,
      servicios_sin_receta: sinReceta.size
        ? [...sinReceta].slice(0, 15)
        : undefined,
      nota: 'Es lo que piden los eventos según las recetas, no el stock de bodega (Eventia no lo lleva). Lo comprado es lo que Compras ya provisionó.',
    };
  },
};
