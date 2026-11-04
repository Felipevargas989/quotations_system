// LOS CAMBIOS DE BELIA SOBRE LOS SERVICIOS DE UNA COTIZACIÓN (doc 20, fase
// 2; Felipe, 03-11: "vamos con lo que no puede hacer para dejarla lista
// hoy").
//
// La IA pide los cambios con ids del catálogo; acá se aplican sobre una
// COPIA de la foto guardada, con las mismas reglas de «Crear con IA»
// (`armarFoto`): el nombre y el precio salen del catálogo de esta empresa,
// la sección fija entra sola, la cantidad es por persona y con tope, y el
// día va dentro del evento. Lo que no se toca queda tal cual, con su precio
// guardado. Si algo no calza no se arma nada: vuelven los errores para que
// la IA corrija. Puro: no lee la base.

import {
  armarFoto,
  fijoDeFoto,
  type EventoParaArmar,
} from 'src/quotations/generar/armar-foto';
import type {
  Catalogo,
  CategoriaDelCatalogo,
} from 'src/quotations/generar/catalogo';
import { diasEntre } from 'src/quotations/generar/fechas';
import { avisosDeForma } from 'src/quotations/generar/forma-de-comida';
import type { CajaDelPlan } from 'src/quotations/generar/tipos';

export type Audiencia = 'adultos' | 'ninos';

export const ACCIONES = [
  'poner_casilla',
  'agregar',
  'quitar',
  'personas',
  'quitar_casilla',
  'poner_fijo',
  'quitar_fijo',
] as const;
export type Accion = (typeof ACCIONES)[number];

/** Un cambio, como lo pide la IA (la herramienta ya lo leyó sin creerle). */
export type Cambio = {
  accion: Accion;
  dia?: number;
  categoria?: string;
  audiencia?: Audiencia;
  personas?: number;
  menu_id?: number;
  quitar?: number[];
  servicios?: Array<{ id: number; cantidad: number }>;
  /** Códigos de los servicios a sacar de una casilla (casi siempre el id). */
  ids?: string[];
  id?: number;
  cantidad?: number;
  /** Las personas que tiene HOY la casilla, si hay dos iguales ese día. */
  cual?: number;
  /** El código de un servicio que tiene HOY la casilla: distingue dos
   *  casillas iguales del mismo día (las cotizaciones del formato antiguo
   *  no traen día ni personas, como la 447 del laboratorio). */
  que_tiene?: string;
};

// La foto como la guarda el cotizador (ServiciosTab.buildItemsSnapshot). Lo
// que no se toca viaja tal cual, con todos sus campos.
type ItemGuardado = {
  codigo?: string | null;
  nombre?: string | null;
  precio?: number | null;
  categoria?: string | null;
  quantity?: number | null;
  [campo: string]: unknown;
};
type CasillaGuardada = {
  category?: string | null;
  category_id?: number | null;
  day?: number | null;
  audience?: string | null;
  people?: number | null;
  items?: ItemGuardado[] | null;
  [campo: string]: unknown;
};
type FijoGuardado = ItemGuardado & { day?: number | null };
export type FotoGuardada = {
  variable_services?: CasillaGuardada[] | null;
  fixed_services?: FijoGuardado[] | null;
  [campo: string]: unknown;
};

export type EventoDeLaCotizacion = EventoParaArmar & {
  /** AAAA-MM-DD del último día, o null si es de un día. */
  ultimoDia: string | null;
};

/** Una línea del antes y el después, para la tarjeta. */
export type LineaDelCambio = {
  /** El día del evento; 0 = un fijo de todo el evento. */
  dia: number;
  /** «Cena · 40 adultos», «Fijo · Salón». */
  que: string;
  quita: string[];
  agrega: string[];
  personas?: { antes: number; despues: number };
  casilla?: 'nueva' | 'sale';
};

export type ResultadoDelCambio =
  | {
      ok: true;
      foto: FotoGuardada;
      lineas: LineaDelCambio[];
      avisos: string[];
      /** Los días que toca (0 = un fijo de todo el evento). */
      diasTocados: number[];
      /** Si alguna casilla baja sus personas (con compras hechas, solo el
       *  administrador; doc 20 §5). */
      bajanPersonas: boolean;
    }
  | { ok: false; errores: string[] };

/** Cuántos cambios caben en una propuesta: una minuta de 14 días con tres
 *  comidas y algo más. */
export const MAX_CAMBIOS = 80;

const n = (v: unknown): number => Number(v) || 0;

const audienciaDe = (c: CasillaGuardada): Audiencia =>
  c.audience === 'ninos' ? 'ninos' : 'adultos';

/** El día de una casilla, como lo guarda el cotizador (`g.day || 1`). */
const diaDe = (c: CasillaGuardada): number => Math.max(1, n(c.day) || 1);

const conCantidad = (it: ItemGuardado): string => {
  const nombre = it.nombre || String(it.codigo ?? '?');
  const q = n(it.quantity) || 1;
  return q > 1 ? `${nombre} ×${q}` : nombre;
};

const llaveDe = (it: ItemGuardado) =>
  `${String(it.codigo ?? '')}|${n(it.quantity) || 1}`;

export function editarFoto(
  actual: FotoGuardada | null | undefined,
  cambios: Cambio[],
  catalogo: Catalogo,
  evento: EventoDeLaCotizacion,
  ofrecible: (categoria: string) => boolean = () => true,
): ResultadoDelCambio {
  const errores: string[] = [];
  const original: FotoGuardada = actual ?? {};
  const foto: FotoGuardada = structuredClone(original);
  foto.variable_services = foto.variable_services ?? [];
  foto.fixed_services = foto.fixed_services ?? [];
  const casillas = foto.variable_services;
  const fijos = foto.fixed_services;

  // De qué casilla (o fijo) guardada sale cada copia: null = nueva. Con eso
  // se arma el antes y el después al final.
  const origen = new Map<CasillaGuardada, CasillaGuardada | null>();
  (original.variable_services ?? []).forEach((c, i) =>
    origen.set(casillas[i], c),
  );
  const origenFijo = new Map<FijoGuardado, FijoGuardado | null>();
  (original.fixed_services ?? []).forEach((f, i) =>
    origenFijo.set(fijos[i], f),
  );
  const salen: CasillaGuardada[] = [];
  const fijosQueSalen: FijoGuardado[] = [];

  const dias = evento.ultimoDia
    ? diasEntre(evento.fecha, evento.ultimoDia) + 1
    : 1;
  const adultos = Math.max(0, evento.personas - evento.ninos);
  const personasDe = (c: CasillaGuardada): number =>
    c.people == null ? evento.personas : n(c.people);
  const topeDe = (a: Audiencia) => (a === 'ninos' ? evento.ninos : adultos);
  const quienes = (a: Audiencia) => (a === 'ninos' ? 'niños' : 'adultos');

  const categoriaDe = (c: CasillaGuardada): CategoriaDelCatalogo | undefined =>
    catalogo.categorias.find((x) => x.id === n(c.category_id)) ??
    catalogo.categorias.find((x) => x.nombre === c.category);
  const ordenDe = (c: CasillaGuardada) =>
    categoriaDe(c)?.orden ?? Number.MAX_SAFE_INTEGER;

  /** Las casillas de ese día, categoría y audiencia (y con esas personas,
   *  si viene `cual`, o con ese servicio, si viene `que_tiene`). */
  const iguales = (cambio: Cambio): CasillaGuardada[] => {
    const cat = catalogo.categorias.find((x) => x.nombre === cambio.categoria);
    return casillas.filter(
      (c) =>
        diaDe(c) === cambio.dia &&
        (c.category === cambio.categoria ||
          (cat !== undefined && n(c.category_id) === cat.id)) &&
        audienciaDe(c) === (cambio.audiencia ?? 'adultos') &&
        (cambio.cual == null || personasDe(c) === cambio.cual) &&
        (cambio.que_tiene == null ||
          (c.items ?? []).some((x) => String(x.codigo) === cambio.que_tiene)),
    );
  };

  const nombreDeLaCasilla = (cambio: Cambio) =>
    `«${cambio.categoria}» de ${quienes(cambio.audiencia ?? 'adultos')} del día ${cambio.dia}`;

  /** La casilla que se cambia: tiene que haber una sola. */
  const una = (
    cambio: Cambio,
    donde: string,
    obligatoria: boolean,
  ): CasillaGuardada | null | false => {
    let lista = iguales(cambio);
    // Al sacar servicios, la casilla es la que los tiene: no hace falta
    // decir cuál si solo una de las iguales los trae.
    if (lista.length > 1 && cambio.accion === 'quitar' && cambio.ids?.length) {
      const conTodos = lista.filter((c) =>
        cambio.ids!.every((id) =>
          (c.items ?? []).some((x) => String(x.codigo) === id),
        ),
      );
      if (conTodos.length === 1) lista = conTodos;
    }
    if (lista.length > 1) {
      errores.push(
        `${donde}: hay ${lista.length} casillas ${nombreDeLaCasilla(cambio)}; di cuál con «que_tiene» (el id de un servicio que tiene esa casilla, como lo trae la ficha) o con «cual» (sus personas hoy: ${lista.map(personasDe).join(', ')}).`,
      );
      return false;
    }
    if (lista.length === 0 && obligatoria) {
      errores.push(
        `${donde}: la cotización no tiene una casilla ${nombreDeLaCasilla(cambio)}.`,
      );
      return false;
    }
    return lista[0] ?? null;
  };

  /** Una casilla armada con las reglas de «Crear con IA». */
  const armar = (caja: CajaDelPlan, donde: string) => {
    const r = armarFoto(
      {
        cajas: [caja],
        fijos: [],
        ultimo_dia: evento.ultimoDia ?? '',
        descuento_porcentaje: 0,
        presupuesto_cliente: { monto: 0, por: 'total' },
        nota: '',
      },
      catalogo,
      evento,
      ofrecible,
    );
    if (!r.ok) {
      errores.push(
        ...r.errores.map(
          (e) => `${donde}: ${e.replace(/^caja 1 \([^)]*\): /, '')}`,
        ),
      );
      return null;
    }
    return r.items.variable_services[0] as unknown as CasillaGuardada;
  };

  /** Una casilla nueva va en su día, en el orden de las categorías. */
  const insertar = (nueva: CasillaGuardada) => {
    let pos = casillas.length;
    for (let k = 0; k < casillas.length; k++) {
      const c = casillas[k];
      if (
        diaDe(c) > diaDe(nueva) ||
        (diaDe(c) === diaDe(nueva) && ordenDe(c) > ordenDe(nueva))
      ) {
        pos = k;
        break;
      }
    }
    casillas.splice(pos, 0, nueva);
  };

  /** Un fijo nuevo va en el orden del catálogo, sin mover los que ya
   *  están. */
  const ordenDeFijos = [...catalogo.fijos.keys()];
  const insertarFijo = (nuevo: FijoGuardado) => {
    const suyo = ordenDeFijos.indexOf(Number(nuevo.codigo));
    const pos = fijos.findIndex((f) => {
      const i = ordenDeFijos.indexOf(Number(f.codigo));
      return i >= 0 && i > suyo;
    });
    if (pos < 0) fijos.push(nuevo);
    else fijos.splice(pos, 0, nuevo);
  };

  const sacar = (c: CasillaGuardada) => {
    const o = origen.get(c);
    if (o) salen.push(o);
    origen.delete(c);
    casillas.splice(casillas.indexOf(c), 1);
  };

  const avisos: string[] = [];
  if (cambios.length === 0) errores.push('La propuesta no trae cambios.');
  if (cambios.length > MAX_CAMBIOS) {
    errores.push(
      `Son ${cambios.length} cambios: el tope es ${MAX_CAMBIOS} por propuesta. Pártela en dos.`,
    );
    return { ok: false, errores };
  }

  cambios.forEach((cambio, i) => {
    const donde = `cambio ${i + 1} (${cambio.accion}${cambio.dia ? `, día ${cambio.dia}` : ''})`;
    const audiencia = cambio.audiencia ?? 'adultos';
    const esDeCasilla = !['poner_fijo', 'quitar_fijo'].includes(cambio.accion);
    if (esDeCasilla) {
      if (!cambio.dia || cambio.dia < 1 || cambio.dia > dias) {
        errores.push(`${donde}: el día debe ir de 1 a ${dias}.`);
        return;
      }
      if (!cambio.categoria) {
        errores.push(`${donde}: falta la categoría de la casilla.`);
        return;
      }
    }

    switch (cambio.accion) {
      case 'poner_casilla': {
        const existente = una(cambio, donde, false);
        if (existente === false) return;
        const nueva = armar(
          {
            dia: cambio.dia!,
            categoria: cambio.categoria!,
            audiencia,
            personas:
              cambio.personas ?? (existente ? personasDe(existente) : 0),
            menu_id: cambio.menu_id ?? 0,
            quitar: cambio.quitar ?? [],
            servicios: cambio.servicios ?? [],
          },
          donde,
        );
        if (!nueva) return;
        if (existente) {
          casillas[casillas.indexOf(existente)] = nueva;
          origen.set(nueva, origen.get(existente) ?? null);
          origen.delete(existente);
        } else {
          insertar(nueva);
          origen.set(nueva, null);
        }
        return;
      }
      case 'agregar': {
        const casilla = una(cambio, donde, true);
        if (!casilla) return;
        if (!cambio.servicios?.length) {
          errores.push(`${donde}: falta qué servicios agregar.`);
          return;
        }
        const cat = categoriaDe(casilla);
        if (!cat) {
          errores.push(
            `${donde}: la categoría de esa casilla ya no está en el catálogo; cámbiala en el cotizador.`,
          );
          return;
        }
        // Se revisan con las reglas del armado, en una casilla de prueba.
        const prueba = armar(
          {
            dia: cambio.dia!,
            categoria: cat.nombre,
            audiencia,
            personas: Math.min(
              Math.max(1, personasDe(casilla)),
              Math.max(1, topeDe(audiencia)),
            ),
            menu_id: 0,
            quitar: [],
            servicios: cambio.servicios,
          },
          donde,
        );
        if (!prueba) return;
        const items = (casilla.items = casilla.items ?? []);
        for (const s of cambio.servicios) {
          const it = (prueba.items ?? []).find(
            (x) => x.codigo === String(s.id),
          );
          if (!it) continue;
          const ya = items.find((x) => String(x.codigo) === it.codigo);
          // Si ya está, queda con la cantidad pedida.
          if (ya) ya.quantity = it.quantity;
          else
            items.push({ ...it, categoria: casilla.category ?? it.categoria });
        }
        return;
      }
      case 'quitar': {
        const casilla = una(cambio, donde, true);
        if (!casilla) return;
        if (!cambio.ids?.length) {
          errores.push(`${donde}: falta qué servicios sacar.`);
          return;
        }
        const cat = categoriaDe(casilla);
        const items = casilla.items ?? [];
        for (const id of cambio.ids) {
          const k = items.findIndex((x) => String(x.codigo) === id);
          if (k < 0) {
            errores.push(
              `${donde}: el servicio ${id} no está en esa casilla (mira los ids en la ficha de la cotización).`,
            );
            continue;
          }
          if (cat?.seccionFija.includes(Number(id))) {
            avisos.push(
              `«${items[k].nombre}» es de la sección fija de «${cat.nombre}»: casi siempre va.`,
            );
          }
          items.splice(k, 1);
        }
        // Una casilla sin servicios no viaja (regla del cotizador).
        if (items.length === 0) sacar(casilla);
        return;
      }
      case 'personas': {
        const casilla = una(cambio, donde, true);
        if (!casilla) return;
        const tope = topeDe(audiencia);
        if (!cambio.personas || cambio.personas < 1 || cambio.personas > tope) {
          errores.push(
            `${donde}: las personas deben ir de 1 a ${tope} (${quienes(audiencia)} del evento). Para más, primero hay que cambiar las personas del evento en la cotización.`,
          );
          return;
        }
        casilla.people = cambio.personas;
        return;
      }
      case 'quitar_casilla': {
        const casilla = una(cambio, donde, true);
        if (casilla) sacar(casilla);
        return;
      }
      case 'poner_fijo': {
        const dia = cambio.dia ?? 0;
        if (!cambio.id) {
          errores.push(`${donde}: falta el id del fijo.`);
          return;
        }
        if (dia < 0 || dia > dias) {
          errores.push(
            `${donde}: el día debe ir de 0 (todo el evento) a ${dias}.`,
          );
          return;
        }
        if (!cambio.cantidad || cambio.cantidad < 1) {
          errores.push(`${donde}: la cantidad debe ser 1 o más.`);
          return;
        }
        const ya = fijos.find(
          (f) => String(f.codigo) === String(cambio.id) && n(f.day) === dia,
        );
        if (ya) {
          // Ya está: cambia la cantidad y conserva su precio guardado.
          ya.quantity = cambio.cantidad;
          return;
        }
        const fijo = catalogo.fijos.get(cambio.id);
        if (!fijo) {
          errores.push(
            `${donde}: el ${cambio.id} no es un fijo de precio fijo del catálogo. Los fijos que dependen de las personas se agregan en el cotizador.`,
          );
          return;
        }
        const nuevo = fijoDeFoto(fijo, dia, cambio.cantidad);
        insertarFijo(nuevo);
        origenFijo.set(nuevo, null);
        return;
      }
      case 'quitar_fijo': {
        const lista = fijos.filter(
          (f) =>
            String(f.codigo) === String(cambio.id) &&
            (cambio.dia == null || n(f.day) === cambio.dia),
        );
        if (lista.length === 0) {
          errores.push(
            `${donde}: la cotización no tiene el fijo ${cambio.id}${cambio.dia != null ? ` en el día ${cambio.dia}` : ''}.`,
          );
          return;
        }
        for (const f of lista) {
          const o = origenFijo.get(f);
          if (o) fijosQueSalen.push(o);
          origenFijo.delete(f);
          fijos.splice(fijos.indexOf(f), 1);
        }
        return;
      }
    }
  });

  if (errores.length > 0) return { ok: false, errores };

  // ---------- El antes y el después ----------
  const lineas: LineaDelCambio[] = [];
  let bajanPersonas = false;
  const queEs = (c: CasillaGuardada) =>
    `${c.category ?? 'Sin categoría'} · ${personasDe(c)} ${quienes(audienciaDe(c))}`;

  for (const o of salen) {
    lineas.push({
      dia: diaDe(o),
      que: queEs(o),
      quita: (o.items ?? []).map(conCantidad),
      agrega: [],
      casilla: 'sale',
    });
  }
  for (const c of casillas) {
    const o = origen.get(c);
    if (o === undefined) continue;
    const items = c.items ?? [];
    if (o === null) {
      lineas.push({
        dia: diaDe(c),
        que: queEs(c),
        quita: [],
        agrega: items.map(conCantidad),
        casilla: 'nueva',
      });
    } else {
      const antes = new Set((o.items ?? []).map(llaveDe));
      const despues = new Set(items.map(llaveDe));
      const quita = (o.items ?? [])
        .filter((it) => !despues.has(llaveDe(it)))
        .map(conCantidad);
      const agrega = items
        .filter((it) => !antes.has(llaveDe(it)))
        .map(conCantidad);
      const p0 = personasDe(o);
      const p1 = personasDe(c);
      if (quita.length === 0 && agrega.length === 0 && p0 === p1) continue;
      if (p1 < p0) bajanPersonas = true;
      lineas.push({
        dia: diaDe(c),
        que: queEs(c),
        quita,
        agrega,
        ...(p0 !== p1 ? { personas: { antes: p0, despues: p1 } } : {}),
      });
    }
    // La forma de la comida, como la revisa «Crear con IA»: avisa, no
    // impide.
    const cat = categoriaDe(c);
    if (cat) {
      avisos.push(
        ...avisosDeForma(
          cat,
          items.map((x) => String(x.codigo)),
          `Día ${diaDe(c)} · ${c.category}`,
        ),
      );
    }
  }
  for (const f of fijosQueSalen) {
    lineas.push({
      dia: n(f.day),
      que: `Fijo · ${f.nombre ?? f.codigo}`,
      quita: [conCantidad(f)],
      agrega: [],
    });
  }
  for (const f of fijos) {
    const o = origenFijo.get(f);
    if (o === undefined) continue;
    if (o === null) {
      lineas.push({
        dia: n(f.day),
        que: `Fijo · ${f.nombre ?? f.codigo}`,
        quita: [],
        agrega: [conCantidad(f)],
      });
    } else if ((n(o.quantity) || 1) !== (n(f.quantity) || 1)) {
      lineas.push({
        dia: n(f.day),
        que: `Fijo · ${f.nombre ?? f.codigo}`,
        quita: [conCantidad(o)],
        agrega: [conCantidad(f)],
      });
    }
  }

  if (lineas.length === 0) {
    return {
      ok: false,
      errores: ['No cambia nada: la cotización ya está así.'],
    };
  }
  lineas.sort((a, b) => a.dia - b.dia);
  return {
    ok: true,
    foto,
    lineas,
    avisos: [...new Set(avisos)],
    diasTocados: [...new Set(lineas.map((l) => l.dia))],
    bajanPersonas,
  };
}
