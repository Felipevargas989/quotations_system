import { esDeComunaCercana } from '../lectura/reglas';
import { normalizar } from '../mercado-publico/mapeo';
import { parecido } from './anterior';
import { type Ganador, ganadoresDe, normalizarRut } from './ganadores';

// LO QUE ENSEÑA LA HISTORIA (doc 17 §5.3, sprint 2): el calendario de lo
// que se repite cada año ("en noviembre viene el Día de Campo del
// Dirigente") y quién gana en la zona. Funciones puras: las pruebas las
// cubren. Los datos son los de la historia (sprint 1b), que guarda lo que
// podría ser del rubro de los últimos 3 años.

/** Un proceso de las regiones de la empresa, como lo trae el repositorio. */
export type ProcesoDeLaZona = {
  codigo: string;
  nombre: string;
  organismo: string | null;
  organismo_codigo: string | null;
  unidad: string | null;
  comuna: string | null;
  region: string | null;
  fecha_publicacion: string | null;
  monto: number | null;
  adjudicacion: {
    oferentes?: number | null;
    url_acta?: string | null;
    ganadores?: Array<{
      nombre?: string | null;
      rut?: string | null;
      cantidad?: number | null;
      monto_unitario?: number | null;
    }>;
  } | null;
};

export type { Ganador };

/** Una compra de este año, licitación o compra ágil, para saber si lo que
 *  «Se viene» ya salió (decisión 110): del radar, que es lo de hoy, y de
 *  los archivos de ChileCompra. */
export type ProcesoReciente = Pick<
  ProcesoDeLaZona,
  'codigo' | 'nombre' | 'organismo' | 'organismo_codigo' | 'fecha_publicacion'
>;

export type SeViene = {
  nombre: string;
  organismo: string | null;
  comuna: string | null;
  /** La región de la última vez: «Se viene» se filtra por región, como la
   *  bandeja (20-10). */
  region: string | null;
  /** Cuándo debería publicarse: la última vez, un año después (ISO). */
  esperada: string;
  /** Ya debió salir y todavía no aparece. */
  atrasada: boolean;
  /** Los años en que salió, de menor a mayor. */
  anios: number[];
  comuna_cercana: boolean;
  alto_valor: boolean;
  ultima: {
    codigo: string;
    fecha_publicacion: string;
    monto: number | null;
    oferentes: number | null;
    ganadores: Ganador[];
  };
};

export type Competidor = {
  rut: string;
  nombre: string;
  triunfos: number;
  /** Lo adjudicado, sumado (lo que se sabe: hay ítems sin precio). */
  monto_total: number;
  ultimo: string | null;
  /** Dónde gana más, de más a menos veces. */
  organismos: Array<{ nombre: string; veces: number }>;
};

export type FichaDeCompetidor = Competidor & {
  triunfos_detalle: Array<{
    codigo: string;
    nombre: string;
    organismo: string | null;
    comuna: string | null;
    fecha_publicacion: string | null;
    monto: number | null;
    oferentes: number | null;
  }>;
};

const PARECIDO_MINIMO = 0.3;
const DIA = 24 * 60 * 60 * 1000;
/** Lo que salió más de medio año después de la última vez es la edición
 *  de este año, no la misma. */
const MEDIO_ANIO = 182 * DIA;

/** El comprador sin el «I.» ni el «Ilustre» del comienzo: el radar dice
 *  «I MUNICIPALIDAD DE QUILLON» y los archivos «ILUSTRE MUNICIPALIDAD DE
 *  QUILLON». */
const claveDelComprador = (organismo: string | null): string =>
  normalizar(organismo).replace(/^(ilustre|i)\s+/, '');

/** La unidad de compra: el comienzo del código (3706 en 3706-382-COT26). */
const unidadDe = (codigo: string): string => codigo.split('-')[0]?.trim() ?? '';

/** Cómo se reconoce al comprador: por el código del organismo, por la
 *  unidad de compra o por el nombre del organismo. Las compras ágiles del
 *  radar no traen el código del organismo, y una municipalidad puede
 *  cambiar de unidad de un año a otro. */
const llavesDelComprador = (p: ProcesoReciente): string[] =>
  [
    p.organismo_codigo ? `o:${p.organismo_codigo}` : '',
    unidadDe(p.codigo) ? `u:${unidadDe(p.codigo)}` : '',
    claveDelComprador(p.organismo) ? `n:${claveDelComprador(p.organismo)}` : '',
  ].filter(Boolean);

/** Lo de este año, agrupado por cada llave de su comprador. */
const porComprador = (recientes: ProcesoReciente[]) => {
  const indice = new Map<string, ProcesoReciente[]>();
  for (const r of recientes) {
    for (const llave of llavesDelComprador(r)) {
      const lista = indice.get(llave);
      if (lista) lista.push(r);
      else indice.set(llave, [r]);
    }
  }
  return indice;
};

const instante = (fecha: string | null): number => {
  const t = fecha ? new Date(fecha).getTime() : NaN;
  return Number.isNaN(t) ? NaN : t;
};

/**
 * SE VIENE: lo que el mismo organismo publicó en años anteriores con un
 * nombre parecido, y que según la fecha de la última vez debería salir en
 * los próximos `dias` (o salió hace menos de `gracia` días y todavía no
 * aparece: "atrasada"). Si este año ya salió, esa es la última vez y queda
 * fuera de la ventana: no se repite lo que ya está en la bandeja.
 * Decisión 110 (Felipe, 29-10): *"darle un rango de tolerancia, hacia el
 * futuro... y al revés también"*, con *"3 semanas atrás y 4 adelante"*; antes
 * eran 30 días atrás y 90 adelante. Y *"hacer un cruce con el ya ocurrió"*:
 * si el mismo comprador ya publicó este año algo parecido, sea licitación o
 * compra ágil (`recientes`), ya no se viene.
 */
export const seVienen = (
  procesos: ProcesoDeLaZona[],
  hoy: Date,
  {
    dias = 28,
    gracia = 21,
    comunas = [] as string[],
    umbralAltoValor = null as number | null,
    recientes = [] as ProcesoReciente[],
  } = {},
): SeViene[] => {
  const porOrganismo = new Map<string, ProcesoDeLaZona[]>();
  for (const p of procesos) {
    if (!p.organismo_codigo || Number.isNaN(instante(p.fecha_publicacion))) {
      continue;
    }
    const grupo = porOrganismo.get(p.organismo_codigo);
    if (grupo) grupo.push(p);
    else porOrganismo.set(p.organismo_codigo, [p]);
  }

  const ahora = hoy.getTime();
  const desde = ahora - gracia * DIA;
  const hasta = ahora + dias * DIA;
  const resultado: SeViene[] = [];
  const deEsteAnio = porComprador(recientes);
  /** ¿El mismo comprador ya publicó algo parecido medio año o más después
   *  de la última vez? Entonces ya salió. */
  const yaSalio = (ultima: ProcesoDeLaZona, t: number) =>
    llavesDelComprador(ultima).some((llave) =>
      (deEsteAnio.get(llave) ?? []).some(
        (r) =>
          instante(r.fecha_publicacion) > t + MEDIO_ANIO &&
          parecido(ultima.nombre, r.nombre) >= PARECIDO_MINIMO,
      ),
    );

  for (const grupo of porOrganismo.values()) {
    grupo.sort(
      (a, b) => instante(a.fecha_publicacion) - instante(b.fecha_publicacion),
    );
    // Series: cada proceso se suma a la serie cuyo último nombre se le
    // parece; si ninguna, abre una nueva.
    const series: ProcesoDeLaZona[][] = [];
    for (const p of grupo) {
      const serie = series.find(
        (s) => parecido(s[s.length - 1].nombre, p.nombre) >= PARECIDO_MINIMO,
      );
      if (serie) serie.push(p);
      else series.push([p]);
    }

    for (const serie of series) {
      const ultima = serie[serie.length - 1];
      const t = instante(ultima.fecha_publicacion);
      const esperada = new Date(t);
      esperada.setUTCFullYear(esperada.getUTCFullYear() + 1);
      const e = esperada.getTime();
      if (e < desde || e > hasta) continue;
      if (yaSalio(ultima, t)) continue;
      const monto =
        ultima.monto ??
        ganadoresDe(ultima.adjudicacion).reduce(
          (suma, g) => suma + (g.monto ?? 0),
          0,
        );
      resultado.push({
        nombre: ultima.nombre,
        organismo: ultima.organismo,
        comuna: ultima.comuna,
        region: ultima.region,
        esperada: esperada.toISOString(),
        atrasada: e < ahora,
        anios: [
          ...new Set(
            serie.map((p) =>
              new Date(instante(p.fecha_publicacion)).getUTCFullYear(),
            ),
          ),
        ].sort((a, b) => a - b),
        comuna_cercana: esDeComunaCercana(ultima, comunas),
        alto_valor:
          umbralAltoValor != null && monto > 0 && monto >= umbralAltoValor,
        ultima: {
          codigo: ultima.codigo,
          fecha_publicacion: new Date(t).toISOString(),
          monto: ultima.monto,
          oferentes: ultima.adjudicacion?.oferentes ?? null,
          ganadores: ganadoresDe(ultima.adjudicacion),
        },
      });
    }
  }
  return resultado.sort((a, b) => a.esperada.localeCompare(b.esperada));
};

/** Todo lo que ganó cada proveedor en la zona. */
const triunfosPorRut = (procesos: ProcesoDeLaZona[]) => {
  const porRut = new Map<
    string,
    {
      nombre: string;
      triunfos: Array<{ p: ProcesoDeLaZona; monto: number | null }>;
    }
  >();
  for (const p of procesos) {
    for (const g of ganadoresDe(p.adjudicacion)) {
      if (!g.rut) continue;
      const actual = porRut.get(g.rut) ?? { nombre: g.nombre, triunfos: [] };
      actual.triunfos.push({ p, monto: g.monto });
      porRut.set(g.rut, actual);
    }
  }
  return porRut;
};

const resumen = (
  rut: string,
  nombre: string,
  triunfos: Array<{ p: ProcesoDeLaZona; monto: number | null }>,
): Competidor => {
  const veces = new Map<string, number>();
  let ultimo: string | null = null;
  for (const { p } of triunfos) {
    const org = p.organismo ?? 'Sin organismo';
    veces.set(org, (veces.get(org) ?? 0) + 1);
    if (p.fecha_publicacion && (!ultimo || p.fecha_publicacion > ultimo)) {
      ultimo = p.fecha_publicacion;
    }
  }
  return {
    rut,
    nombre,
    triunfos: triunfos.length,
    monto_total: triunfos.reduce((s, t) => s + (t.monto ?? 0), 0),
    ultimo,
    organismos: [...veces]
      .map(([n, v]) => ({ nombre: n, veces: v }))
      .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre)),
  };
};

/** Quién gana en la zona: de más triunfos a menos (y, a igual número, el
 *  que más monto se llevó). */
export const rankingDeCompetidores = (
  procesos: ProcesoDeLaZona[],
  limite = 50,
): Competidor[] =>
  [...triunfosPorRut(procesos)]
    .map(([rut, { nombre, triunfos }]) => resumen(rut, nombre, triunfos))
    .sort(
      (a, b) =>
        b.triunfos - a.triunfos ||
        b.monto_total - a.monto_total ||
        a.nombre.localeCompare(b.nombre),
    )
    .slice(0, limite);

/** La ficha de un proveedor: todo lo que ganó en la zona, lo último primero. */
export const fichaDeCompetidor = (
  procesos: ProcesoDeLaZona[],
  rut: string,
): FichaDeCompetidor | null => {
  const clave = normalizarRut(rut);
  const datos = triunfosPorRut(procesos).get(clave);
  if (!datos) return null;
  return {
    ...resumen(clave, datos.nombre, datos.triunfos),
    triunfos_detalle: datos.triunfos
      .map(({ p, monto }) => ({
        codigo: p.codigo,
        nombre: p.nombre,
        organismo: p.organismo,
        comuna: p.comuna,
        fecha_publicacion: p.fecha_publicacion,
        monto,
        oferentes: p.adjudicacion?.oferentes ?? null,
      }))
      .sort((a, b) =>
        (b.fecha_publicacion ?? '').localeCompare(a.fecha_publicacion ?? ''),
      ),
  };
};
