// CHOQUES DE FECHA (Felipe, 18-10-2026; mapa 02 §5.6).
//
// "Cuando una cotización se cierra, debería dejar una alerta a revisar si
// la otra cotización se puede hacer o no (...) una alerta en rojo y yo pueda
// pinchar: no, hay que hacer una gestión; o sí se puede, puede continuar con
// esa fecha." Y sin atajo por evento: "va a depender de qué espacios se
// utilicen, qué horarios tengan (...) inclusive si fuera cabañas, puede
// coincidir con otro evento de cabañas". Cada par se revisa uno por uno.
//
// El choque se CALCULA, no se guarda: una cotización viva cuyas fechas se
// topan con las de una aceptada. Lo único que se guarda (migración 143) es
// lo que la persona decidió para ese par, con las fechas de ese momento: si
// cualquiera de las dos cambia de fecha, el aviso vuelve.

import { ddmm } from '../seguimiento/elegibles';

/** Las vivas: todavía se pueden mover o descartar. */
export const ESTADOS_VIVOS_DEL_CHOQUE = [
  'solicitada',
  'enviada',
  'en_negociacion',
];

export type DecisionDelChoque = 'puede_seguir' | 'gestionar';

export type CotizacionDelChoque = {
  id: string;
  quotation_number: number;
  event_date: string | null;
  event_end_date: string | null;
  cliente: string | null;
  /** Solo de la aceptada: trae la exclusividad del catálogo. */
  exclusiva?: boolean;
};

export type DecisionGuardada = {
  quotation_id: string;
  aceptada_id: string;
  fechas_viva: string;
  fechas_aceptada: string;
};

export type AceptadaQueChoca = {
  id: string;
  numero: number;
  cliente: string | null;
  /** AAAA-MM-DD. */
  desde: string;
  hasta: string;
  exclusiva: boolean;
};

export type ChoqueDeFecha = {
  quotation_id: string;
  quotation_number: number;
  aceptada: AceptadaQueChoca;
};

export type Rango = { desde: string; hasta: string };

/** Las fechas de una cotización. Sin fin, un día; un fin anterior al
 *  inicio (error de datos, como la 498) también cuenta como un día. */
export function rangoDe(q: {
  event_date: string | null;
  event_end_date: string | null;
}): Rango | null {
  if (!q.event_date) return null;
  const desde = q.event_date.slice(0, 10);
  const fin = q.event_end_date ? q.event_end_date.slice(0, 10) : desde;
  return { desde, hasta: fin < desde ? desde : fin };
}

/** "AAAA-MM-DD..AAAA-MM-DD": así se guardan las fechas de la decisión. */
export const textoDelRango = (r: Rango): string => `${r.desde}..${r.hasta}`;

/** La exclusividad del catálogo («Exclusividad Full», «Lun a Jue», «Vie a
 *  Dom (Empresas)»): un ítem de la foto de la cotización con ese nombre. */
export const tieneExclusividad = (items: unknown): boolean =>
  /exclusividad/i.test(JSON.stringify(items ?? ''));

/** Los choques que esperan revisión: cada viva con cada aceptada cuyas
 *  fechas se topan (desde hoy en adelante), menos los que ya se decidieron
 *  con esas mismas fechas. Primero los más próximos. */
export function choquesDe(p: {
  vivas: CotizacionDelChoque[];
  aceptadas: CotizacionDelChoque[];
  decisiones: DecisionGuardada[];
  /** AAAA-MM-DD de Chile. */
  hoy: string;
}): ChoqueDeFecha[] {
  const decididas = new Map(
    p.decisiones.map((d) => [`${d.quotation_id}|${d.aceptada_id}`, d]),
  );
  const choques: ChoqueDeFecha[] = [];
  for (const a of p.aceptadas) {
    const ra = rangoDe(a);
    if (!ra || ra.hasta < p.hoy) continue;
    for (const v of p.vivas) {
      if (v.id === a.id) continue;
      const rv = rangoDe(v);
      if (!rv || rv.hasta < p.hoy) continue;
      if (!(rv.desde <= ra.hasta && ra.desde <= rv.hasta)) continue;
      const d = decididas.get(`${v.id}|${a.id}`);
      if (
        d &&
        d.fechas_viva === textoDelRango(rv) &&
        d.fechas_aceptada === textoDelRango(ra)
      ) {
        continue;
      }
      choques.push({
        quotation_id: v.id,
        quotation_number: v.quotation_number,
        aceptada: {
          id: a.id,
          numero: a.quotation_number,
          cliente: a.cliente,
          desde: ra.desde,
          hasta: ra.hasta,
          exclusiva: Boolean(a.exclusiva),
        },
      });
    }
  }
  return choques.sort(
    (x, y) =>
      x.aceptada.desde.localeCompare(y.aceptada.desde) ||
      x.quotation_number - y.quotation_number ||
      x.aceptada.numero - y.aceptada.numero,
  );
}

/** La línea de la bitácora de la cotización viva, sin cifras. */
export function notaDelChoque(
  a: AceptadaQueChoca,
  decision: DecisionDelChoque,
): string {
  const fechas =
    a.desde === a.hasta
      ? `el ${ddmm(a.desde)}`
      : `del ${ddmm(a.desde)} al ${ddmm(a.hasta)}`;
  const con = `la N° ${a.numero}${a.cliente ? ` (${a.cliente})` : ''}, aceptada ${fechas}${a.exclusiva ? ', con exclusividad' : ''}`;
  return decision === 'puede_seguir'
    ? `Revisado el choque de fecha con ${con}: puede seguir con su fecha.`
    : `Choca con ${con}: hay que gestionar, mover la fecha o descartar.`;
}
