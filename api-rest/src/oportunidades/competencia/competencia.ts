import type { ActaDeAdjudicacion } from '../historia/acta';
import { normalizarRut } from '../historia/ganadores';

// COMPETIDORES REALES (decisiones 70 y 71 del doc 17). Felipe, 22-10: "en mis
// competidores, podemos hacerle seguimiento a las empresas con las que he
// competido... un botón de «no es mi competidor» (con un confirmar)". Y el
// 23-10, al verlo: "mis competidores son esos": los que ofertaron donde
// ofertó la empresa, ganara o perdiera; "y luego traer la información de
// ellos, todas las licitaciones en las que participan... es como un
// estudio de mercado". Sin IA: todo sale de las actas públicas.
//
//  - «Compitió contigo»: ofertó donde la empresa también ofertó (los dos
//    RUT en la misma acta, o en la misma compra ágil si Mercado Público
//    dice quién cotizó);
//  - «Lo sigues»: la empresa lo marcó con «Seguir».
// «No es mi competidor» lo saca de la lista (queda aparte, se recupera).
// «Parecido a ti» (la IA) se sacó el 23-10: "va a ser muy complejo que la
// IA sea capaz de identificar lo mismo".

/** Una oferta del acta, resumida por proveedor (una fila de mp_ofertas). */
export type OfertaLeida = {
  codigo: string;
  rut: string;
  proveedor: string;
  total_ofertado: number | null;
  total_adjudicado: number;
  adjudicada: boolean;
  lineas: number;
  detalle: string | null;
  proceso: string | null;
  organismo_codigo: string | null;
  organismo: string | null;
  region: string | null;
  comuna: string | null;
  fecha: string | null;
};

/** Lo del proceso que va con cada oferta (para consultar sin cruces). */
export type ProcesoDelActa = {
  codigo: string;
  nombre: string | null;
  organismo_codigo: string | null;
  organismo: string | null;
  region: string | null;
  comuna: string | null;
  fecha_publicacion: string | null;
};

/** El acta en filas: una por proveedor con RUT. El total ofertado es el
 *  precio unitario neto por la cantidad pedida, sumado en sus líneas (null
 *  si no dio ningún precio). */
export const ofertasDelActa = (
  p: ProcesoDelActa,
  acta: ActaDeAdjudicacion,
): OfertaLeida[] => {
  const porRut = new Map<string, OfertaLeida>();
  for (const item of acta.items) {
    for (const o of item.ofertas) {
      const rut = normalizarRut(o.rut);
      if (!rut) continue;
      const fila =
        porRut.get(rut) ??
        ({
          codigo: p.codigo,
          rut,
          proveedor: o.proveedor.trim(),
          total_ofertado: null,
          total_adjudicado: 0,
          adjudicada: false,
          lineas: 0,
          detalle: null,
          proceso: p.nombre,
          organismo_codigo: p.organismo_codigo,
          organismo: p.organismo,
          region: p.region,
          comuna: p.comuna,
          fecha: p.fecha_publicacion?.slice(0, 10) ?? null,
        } satisfies OfertaLeida);
      fila.lineas += 1;
      if (o.precio_unitario !== null) {
        fila.total_ofertado =
          (fila.total_ofertado ?? 0) +
          o.precio_unitario *
            (item.cantidad && item.cantidad > 0 ? item.cantidad : 1);
      }
      fila.total_adjudicado += o.total_adjudicado;
      fila.adjudicada = fila.adjudicada || o.adjudicada;
      if (!fila.detalle && o.detalle.trim()) {
        fila.detalle = o.detalle.trim().slice(0, 300);
      }
      porRut.set(rut, fila);
    }
  }
  return [...porRut.values()];
};

export type EtiquetaDeCompetidor = 'compitio' | 'seguido';

/** Lo que la empresa marcó de un proveedor. */
export type MarcaDeCompetidor = {
  rut: string;
  nombre: string | null;
  seguido: boolean;
  descartado: boolean;
};

export type CompetidorReal = {
  rut: string;
  nombre: string;
  etiquetas: EtiquetaDeCompetidor[];
  /** Licitaciones donde ofertaron los dos. */
  encuentros: number;
  /** De esas, cuántas ganó él y cuántas la empresa (en una de varias
   *  líneas pueden ganar los dos). */
  te_gano: number;
  ganaste: number;
  /** Su precio frente al tuyo, en % y en promedio, solo en las líneas que
   *  ofertaron los dos: −10 = 10 % más barato. null si no hay ninguna. */
  diferencia_de_precio: number | null;
  lineas_comparadas: number;
  /** Lo suyo en las actas leídas de la zona: el estudio de mercado. */
  participaciones: number;
  ganadas: number;
  monto_ganado: number;
  /** La fecha más nueva en que se le vio ofertar. */
  ultima: string | null;
  /** El comprador donde más participa. */
  comprador_principal: { nombre: string; veces: number } | null;
  seguido: boolean;
  descartado: boolean;
};

/** Una licitación donde ofertaron los dos. */
export type Encuentro = {
  codigo: string;
  proceso: string | null;
  organismo: string | null;
  fecha: string | null;
  su_oferta: number | null;
  tu_oferta: number | null;
  gano_el: boolean;
  ganaste: boolean;
  diferencia_de_precio: number | null;
  lineas_comparadas: number;
};

const masNueva = (a: string | null, b: string | null) =>
  !a ? b : !b ? a : a > b ? a : b;

const promedio = (xs: readonly number[]): number | null =>
  xs.length === 0
    ? null
    : Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10;

/** Su precio frente al tuyo, en % por cada línea que ofertaron los dos
 *  (−10 = 10 % más barato). Con el acta se compara precio unitario contra
 *  precio unitario de la MISMA línea: comparar los totales mezclaba líneas
 *  distintas (el 23-10 Centropan salió «3.984 % más caro» por ofertar otra
 *  cosa). Sin acta (una compra ágil), los totales, solo si cada uno ofertó
 *  una sola línea. */
export const diferenciasDePrecio = (
  suyo: string,
  tuyo: string,
  acta: ActaDeAdjudicacion | null | undefined,
  su: Pick<OfertaLeida, 'total_ofertado' | 'lineas'> | undefined,
  tu: Pick<OfertaLeida, 'total_ofertado' | 'lineas'> | undefined,
): number[] => {
  const s = normalizarRut(suyo);
  const t = normalizarRut(tuyo);
  if (acta && acta.items.length > 0) {
    const r: number[] = [];
    for (const item of acta.items) {
      const precio = (rut: string) =>
        item.ofertas.find(
          (o) =>
            normalizarRut(o.rut) === rut &&
            o.precio_unitario !== null &&
            o.precio_unitario > 0,
        )?.precio_unitario ?? null;
      const a = precio(s);
      const b = precio(t);
      if (a !== null && b !== null) r.push((a / b - 1) * 100);
    }
    return r;
  }
  if (
    su?.total_ofertado &&
    tu?.total_ofertado &&
    su.lineas === 1 &&
    tu.lineas === 1
  ) {
    return [(su.total_ofertado / tu.total_ofertado - 1) * 100];
  }
  return [];
};

/** Lo suyo en las ofertas leídas: cuántas, cuántas ganó, cuánto, la última
 *  y el comprador donde más participa. */
const resumenDeMercado = (ofertas: readonly OfertaLeida[]) => {
  const unicas = [...new Map(ofertas.map((o) => [o.codigo, o])).values()];
  const veces = new Map<string, number>();
  for (const o of unicas) {
    const org = o.organismo?.trim();
    if (org) veces.set(org, (veces.get(org) ?? 0) + 1);
  }
  const principal = [...veces].sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  )[0];
  const ganadas = unicas.filter((o) => o.adjudicada);
  return {
    participaciones: unicas.length,
    ganadas: ganadas.length,
    monto_ganado: ganadas.reduce((s, o) => s + o.total_adjudicado, 0),
    ultima: unicas.reduce<string | null>((u, o) => masNueva(u, o.fecha), null),
    comprador_principal: principal
      ? { nombre: principal[0], veces: principal[1] }
      : null,
  };
};

/** La lista de «Tus competidores»: los que ofertaron donde ofertó la
 *  empresa, y los que sigue; con su historia en la zona. */
export function competidoresReales(d: {
  rutEmpresa: string;
  /** Todas las ofertas de las licitaciones donde ofertó la empresa. */
  ofertasConLaEmpresa: ReadonlyArray<OfertaLeida>;
  /** Todas las ofertas leídas de cada competidor (su historia). */
  historial: ReadonlyArray<OfertaLeida>;
  /** Las actas de las licitaciones de la empresa (línea a línea). */
  actas: ReadonlyMap<string, ActaDeAdjudicacion | null>;
  marcas: ReadonlyArray<MarcaDeCompetidor>;
}): CompetidorReal[] {
  const empresa = normalizarRut(d.rutEmpresa);
  const marcas = new Map(d.marcas.map((m) => [normalizarRut(m.rut), m]));
  const mias = new Map<string, OfertaLeida>();
  for (const o of d.ofertasConLaEmpresa) {
    if (o.rut === empresa) mias.set(o.codigo, o);
  }
  const rivales = new Map<
    string,
    { nombre: string; encuentros: Map<string, OfertaLeida> }
  >();
  for (const o of d.ofertasConLaEmpresa) {
    if (o.rut === empresa || !mias.has(o.codigo)) continue;
    const r = rivales.get(o.rut) ?? {
      nombre: o.proveedor,
      encuentros: new Map<string, OfertaLeida>(),
    };
    r.encuentros.set(o.codigo, o);
    rivales.set(o.rut, r);
  }
  for (const m of marcas.values()) {
    const rut = normalizarRut(m.rut);
    if (m.seguido && rut !== empresa && !rivales.has(rut)) {
      rivales.set(rut, { nombre: m.nombre ?? rut, encuentros: new Map() });
    }
  }
  const historial = new Map<string, OfertaLeida[]>();
  for (const o of d.historial) {
    const h = historial.get(o.rut) ?? [];
    h.push(o);
    historial.set(o.rut, h);
  }

  const lista: CompetidorReal[] = [];
  for (const [rut, { nombre, encuentros }] of rivales) {
    const marca = marcas.get(rut);
    const etiquetas: EtiquetaDeCompetidor[] = [];
    if (encuentros.size > 0) etiquetas.push('compitio');
    if (marca?.seguido) etiquetas.push('seguido');
    if (etiquetas.length === 0) continue;
    const cruces = [...encuentros.values()];
    const diferencias = cruces.flatMap((o) =>
      diferenciasDePrecio(
        rut,
        empresa,
        d.actas.get(o.codigo),
        o,
        mias.get(o.codigo),
      ),
    );
    lista.push({
      rut,
      nombre: marca?.nombre?.trim() || nombre,
      etiquetas,
      encuentros: cruces.length,
      te_gano: cruces.filter((o) => o.adjudicada).length,
      ganaste: cruces.filter((o) => mias.get(o.codigo)?.adjudicada).length,
      diferencia_de_precio: promedio(diferencias),
      lineas_comparadas: diferencias.length,
      ...resumenDeMercado([...(historial.get(rut) ?? []), ...cruces]),
      seguido: Boolean(marca?.seguido),
      descartado: Boolean(marca?.descartado),
    });
  }
  return lista.sort(
    (a, b) =>
      Number(b.seguido) - Number(a.seguido) ||
      b.encuentros - a.encuentros ||
      b.participaciones - a.participaciones ||
      a.nombre.localeCompare(b.nombre),
  );
}

/** Una licitación del estudio de mercado de un competidor. */
export type ParticipacionDeMercado = {
  codigo: string;
  proceso: string | null;
  organismo: string | null;
  comuna: string | null;
  fecha: string | null;
  /** Su oferta (neta) y en cuántas líneas; de una adjudicación sin acta
   *  leída, lo que se le adjudicó. */
  su_oferta: number | null;
  lineas: number | null;
  detalle: string | null;
  gano: boolean;
  /** Quién ganó (él, otros, o los dos en líneas distintas). */
  ganadores: Array<{ rut: string; nombre: string; monto: number }>;
  /** Cuántos ofertaron. */
  ofertas: number | null;
  /** Ofertó también la empresa. */
  contigo: boolean;
};

export type FichaDeMercado = {
  rut: string;
  nombre: string;
  seguido: boolean;
  descartado: boolean;
  resumen: {
    participaciones: number;
    ganadas: number;
    perdidas: number;
    monto_ganado: number;
    ultima: string | null;
    /** A quién le vende: cuántas veces participó y cuántas ganó. */
    compradores: Array<{ nombre: string; veces: number; ganadas: number }>;
  };
  encuentros: Encuentro[];
  licitaciones: ParticipacionDeMercado[];
};

/** Lo que ganó en la zona según la adjudicación (la API), con o sin acta. */
export type TriunfoDeLaZona = {
  codigo: string;
  nombre: string;
  organismo: string | null;
  comuna: string | null;
  fecha_publicacion: string | null;
  monto: number | null;
  oferentes: number | null;
};

/** El estudio de mercado de un competidor: todas las licitaciones donde
 *  participó (las actas leídas) más lo que ganó en la zona sin acta leída,
 *  a quién le vende y cuándo compitió con la empresa. null si no hay nada. */
export function fichaDeMercado(d: {
  rut: string;
  rutEmpresa: string;
  /** Sus ofertas leídas. */
  ofertas: ReadonlyArray<OfertaLeida>;
  /** Todas las ofertas de esas licitaciones (para saber quién ganó). */
  enSusLicitaciones: ReadonlyArray<OfertaLeida>;
  triunfosDeLaZona: ReadonlyArray<TriunfoDeLaZona>;
  actas: ReadonlyMap<string, ActaDeAdjudicacion | null>;
  marca: MarcaDeCompetidor | null;
  nombreDeLaZona?: string | null;
}): FichaDeMercado | null {
  const rut = normalizarRut(d.rut);
  const empresa = normalizarRut(d.rutEmpresa);
  const suyas = new Map(
    d.ofertas.filter((o) => o.rut === rut).map((o) => [o.codigo, o]),
  );
  const porCodigo = new Map<string, OfertaLeida[]>();
  for (const o of d.enSusLicitaciones) {
    const l = porCodigo.get(o.codigo) ?? [];
    l.push(o);
    porCodigo.set(o.codigo, l);
  }
  const licitaciones: ParticipacionDeMercado[] = [];
  const encuentros: Encuentro[] = [];
  for (const [codigo, o] of suyas) {
    const todas = porCodigo.get(codigo) ?? [o];
    const mia = empresa
      ? todas.find((x) => x.rut === empresa && x.rut !== rut)
      : undefined;
    licitaciones.push({
      codigo,
      proceso: o.proceso,
      organismo: o.organismo,
      comuna: o.comuna,
      fecha: o.fecha,
      su_oferta: o.total_ofertado,
      lineas: o.lineas,
      detalle: o.detalle,
      gano: o.adjudicada,
      ganadores: todas
        .filter((x) => x.adjudicada)
        .map((x) => ({
          rut: x.rut,
          nombre: x.proveedor,
          monto: x.total_adjudicado,
        })),
      ofertas: todas.length,
      contigo: Boolean(mia),
    });
    if (mia) {
      const diferencias = diferenciasDePrecio(
        rut,
        empresa,
        d.actas.get(codigo),
        o,
        mia,
      );
      encuentros.push({
        codigo,
        proceso: o.proceso,
        organismo: o.organismo,
        fecha: o.fecha,
        su_oferta: o.total_ofertado,
        tu_oferta: mia.total_ofertado,
        gano_el: o.adjudicada,
        ganaste: mia.adjudicada,
        diferencia_de_precio: promedio(diferencias),
        lineas_comparadas: diferencias.length,
      });
    }
  }
  for (const t of d.triunfosDeLaZona) {
    if (suyas.has(t.codigo)) continue;
    licitaciones.push({
      codigo: t.codigo,
      proceso: t.nombre,
      organismo: t.organismo,
      comuna: t.comuna,
      fecha: t.fecha_publicacion?.slice(0, 10) ?? null,
      su_oferta: t.monto,
      lineas: null,
      detalle: null,
      gano: true,
      ganadores: [{ rut, nombre: '', monto: t.monto ?? 0 }],
      ofertas: t.oferentes,
      contigo: false,
    });
  }
  if (licitaciones.length === 0 && !d.marca?.seguido) return null;

  const compradores = new Map<string, { veces: number; ganadas: number }>();
  for (const l of licitaciones) {
    const org = l.organismo?.trim();
    if (!org) continue;
    const c = compradores.get(org) ?? { veces: 0, ganadas: 0 };
    c.veces += 1;
    if (l.gano) c.ganadas += 1;
    compradores.set(org, c);
  }
  const ganadas = licitaciones.filter((l) => l.gano);
  const primera = [...suyas.values()][0];
  const nombre =
    d.marca?.nombre?.trim() ||
    primera?.proveedor?.trim() ||
    d.nombreDeLaZona?.trim() ||
    rut;
  for (const l of licitaciones) {
    for (const g of l.ganadores)
      if (g.rut === rut && !g.nombre) g.nombre = nombre;
  }
  return {
    rut,
    nombre,
    seguido: Boolean(d.marca?.seguido),
    descartado: Boolean(d.marca?.descartado),
    resumen: {
      participaciones: licitaciones.length,
      ganadas: ganadas.length,
      perdidas: licitaciones.length - ganadas.length,
      monto_ganado: ganadas.reduce(
        (s, l) =>
          s +
          (l.ganadores.find((g) => g.rut === rut)?.monto ?? l.su_oferta ?? 0),
        0,
      ),
      ultima: licitaciones.reduce<string | null>(
        (u, l) => masNueva(u, l.fecha),
        null,
      ),
      compradores: [...compradores]
        .map(([n, c]) => ({ nombre: n, ...c }))
        .sort((a, b) => b.veces - a.veces || a.nombre.localeCompare(b.nombre)),
    },
    encuentros: encuentros.sort((a, b) =>
      (b.fecha ?? '').localeCompare(a.fecha ?? ''),
    ),
    licitaciones: licitaciones.sort((a, b) =>
      (b.fecha ?? '').localeCompare(a.fecha ?? ''),
    ),
  };
}
