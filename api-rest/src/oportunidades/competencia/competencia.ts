import type { ActaDeAdjudicacion } from '../historia/acta';
import { normalizarRut } from '../historia/ganadores';

// COMPETIDORES REALES (decisión 70 del doc 17, 22-10). Felipe: "en mis
// competidores, podemos hacerle seguimiento a las empresas con las que he
// competido... también busca empresas similares, complejos turísticos o
// restaurantes que hayan postulado a servicios públicos a los que yo
// postulo... un botón de «no es mi competidor» (con un confirmar)".
//
// Tres fuentes, sin IA salvo la clasificación:
//  - «Compitió contigo»: ofertó en una licitación donde la empresa también
//    ofertó (los dos RUT en la misma acta pública de adjudicación);
//  - «Parecido a ti»: ofertó en los compradores donde la empresa postula y
//    la IA lo ve parecido (complejo turístico, centro de eventos,
//    restaurante, banquetería…);
//  - «Lo sigues»: la empresa lo marcó con «Seguir».
// «No es mi competidor» lo saca de la lista (queda en «Descartados»).

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

export type EtiquetaDeCompetidor = 'compitio' | 'similar' | 'seguido';

/** Lo que la empresa marcó de un proveedor y lo que dijo la IA. */
export type MarcaDeCompetidor = {
  rut: string;
  nombre: string | null;
  seguido: boolean;
  descartado: boolean;
  parecido: 'si' | 'no' | null;
  parecido_razon: string | null;
};

export type CompetidorReal = {
  rut: string;
  nombre: string;
  etiquetas: EtiquetaDeCompetidor[];
  /** Licitaciones donde ofertaron los dos. */
  encuentros: number;
  /** De esas, cuántas ganó él y cuántas la empresa. */
  te_gano: number;
  ganaste: number;
  /** Su oferta frente a la tuya, en promedio y en %: −10 = 10 % más barato.
   *  null si no hay dos precios que comparar. */
  diferencia_de_precio: number | null;
  /** Sus ofertas y sus triunfos en los compradores donde postulas. */
  en_tus_compradores: number;
  triunfos_en_tus_compradores: number;
  monto_ganado: number;
  /** La fecha más nueva en que se le vio ofertar. */
  ultima: string | null;
  parecido_razon: string | null;
  seguido: boolean;
  descartado: boolean;
};

/** Un encuentro: una licitación donde ofertaron los dos. */
export type Encuentro = {
  codigo: string;
  proceso: string | null;
  organismo: string | null;
  fecha: string | null;
  su_oferta: number | null;
  tu_oferta: number | null;
  gano_el: boolean;
  ganaste: boolean;
};

const masNueva = (a: string | null, b: string | null) =>
  !a ? b : !b ? a : a > b ? a : b;

/** La lista de «Tus competidores reales». `ofertas`: las de las
 *  licitaciones donde ofertó la empresa y las de sus compradores. */
export function competidoresReales(d: {
  rutEmpresa: string;
  ofertas: ReadonlyArray<OfertaLeida>;
  /** Los compradores donde la empresa postula (organismo_codigo). */
  compradores: ReadonlySet<string>;
  marcas: ReadonlyArray<MarcaDeCompetidor>;
}): CompetidorReal[] {
  const empresa = normalizarRut(d.rutEmpresa);
  const marcas = new Map(d.marcas.map((m) => [normalizarRut(m.rut), m]));
  const mias = new Map<string, OfertaLeida>();
  for (const o of d.ofertas) if (o.rut === empresa) mias.set(o.codigo, o);

  const porRut = new Map<string, { nombre: string; ofertas: OfertaLeida[] }>();
  for (const o of d.ofertas) {
    if (o.rut === empresa) continue;
    const r = porRut.get(o.rut) ?? { nombre: o.proveedor, ofertas: [] };
    r.ofertas.push(o);
    porRut.set(o.rut, r);
  }
  // Los que la empresa sigue aunque no aparezcan en estas actas.
  for (const m of marcas.values()) {
    if (m.seguido && !porRut.has(m.rut) && m.rut !== empresa) {
      porRut.set(m.rut, { nombre: m.nombre ?? m.rut, ofertas: [] });
    }
  }

  const lista: CompetidorReal[] = [];
  for (const [rut, { nombre, ofertas }] of porRut) {
    const marca = marcas.get(rut);
    const unicas = new Map(ofertas.map((o) => [o.codigo, o]));
    const encuentros = [...unicas.values()].filter((o) => mias.has(o.codigo));
    const enCompradores = [...unicas.values()].filter(
      (o) => o.organismo_codigo && d.compradores.has(o.organismo_codigo),
    );
    const etiquetas: EtiquetaDeCompetidor[] = [];
    if (encuentros.length > 0) etiquetas.push('compitio');
    if (marca?.parecido === 'si' && enCompradores.length > 0) {
      etiquetas.push('similar');
    }
    if (marca?.seguido) etiquetas.push('seguido');
    if (etiquetas.length === 0) continue;

    const diferencias = encuentros
      .map((o) => {
        const tuya = mias.get(o.codigo)?.total_ofertado ?? null;
        return o.total_ofertado && tuya
          ? (o.total_ofertado / tuya - 1) * 100
          : null;
      })
      .filter((x): x is number => x !== null);
    lista.push({
      rut,
      nombre: marca?.nombre?.trim() || nombre,
      etiquetas,
      encuentros: encuentros.length,
      te_gano: encuentros.filter((o) => o.adjudicada).length,
      ganaste: encuentros.filter((o) => mias.get(o.codigo)?.adjudicada).length,
      diferencia_de_precio:
        diferencias.length > 0
          ? Math.round(
              (diferencias.reduce((s, x) => s + x, 0) / diferencias.length) *
                10,
            ) / 10
          : null,
      en_tus_compradores: enCompradores.length,
      triunfos_en_tus_compradores: enCompradores.filter((o) => o.adjudicada)
        .length,
      monto_ganado: enCompradores.reduce(
        (s, o) => s + (o.adjudicada ? o.total_adjudicado : 0),
        0,
      ),
      ultima: [...unicas.values()].reduce<string | null>(
        (u, o) => masNueva(u, o.fecha),
        null,
      ),
      parecido_razon: marca?.parecido_razon ?? null,
      seguido: Boolean(marca?.seguido),
      descartado: Boolean(marca?.descartado),
    });
  }
  return lista.sort(
    (a, b) =>
      Number(b.seguido) - Number(a.seguido) ||
      b.encuentros - a.encuentros ||
      b.triunfos_en_tus_compradores - a.triunfos_en_tus_compradores ||
      a.nombre.localeCompare(b.nombre),
  );
}

/** Las licitaciones donde ofertaron la empresa y un proveedor, lo más
 *  nuevo primero. */
export function encuentrosCon(
  rut: string,
  rutEmpresa: string,
  ofertas: ReadonlyArray<OfertaLeida>,
): Encuentro[] {
  const suyo = normalizarRut(rut);
  const empresa = normalizarRut(rutEmpresa);
  const mias = new Map(
    ofertas.filter((o) => o.rut === empresa).map((o) => [o.codigo, o]),
  );
  return ofertas
    .filter((o) => o.rut === suyo && mias.has(o.codigo))
    .map((o) => {
      const mia = mias.get(o.codigo)!;
      return {
        codigo: o.codigo,
        proceso: o.proceso,
        organismo: o.organismo,
        fecha: o.fecha,
        su_oferta: o.total_ofertado,
        tu_oferta: mia.total_ofertado,
        gano_el: o.adjudicada,
        ganaste: mia.adjudicada,
      };
    })
    .sort((a, b) => (b.fecha ?? '').localeCompare(a.fecha ?? ''));
}
