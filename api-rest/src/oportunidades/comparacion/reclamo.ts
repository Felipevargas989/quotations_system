import type { ResultadoPublico } from '../competencia/resultado-compra-agil';
import type { ActaDeAdjudicacion } from '../historia/acta';
import { normalizarRut } from '../historia/ganadores';
import type { Oferente } from '../oferente/oferente.repository';
import type {
  IncumplimientoGrave,
  LecturaDeUnaOferta,
  LineaComparada,
} from './comparacion';

// EL RECLAMO DE UNA OFERTA (decisión 59 del doc 17, 20-10). Felipe:
// "dejemos en el comparativo una función de que en caso de incumplimiento
// grave, genere un texto para hacer un reclamos en el centro de ayuda". Lo
// arma el motor, sin IA: lo que la comparación encontró en la oferta de un
// competidor (qué, dónde se ve y qué regla incumple) y los datos de «Mi
// empresa». Eventia no envía nada. Nació del caso Integra
// (1072229-25-L125): dos ofertas de la misma gente y una experiencia mal
// respaldada que la comisión no vio.
//
// Desde la decisión 125 (11-11), solo contra quien compite con la empresa:
// en las líneas a las que ella postuló. Y lo que «falta» entra al reclamo
// solo si se leyó todo lo de ese oferente: el 11-11, con la 5040-14-LE26,
// el reclamo decía que un competidor no adjuntó sus órdenes de compra, y
// venían en un .rar que Eventia no trae.
//
// DESPUÉS DE LA RESOLUCIÓN (decisión 128, 11-11). Felipe: "el reclamo creo
// que debe ser post resolución, si gano no reclamo, si pierdo sí, y debería
// ser una sección abajo para generar reclamos". Ya no se arma al comparar ni
// se ofrece antes de adjudicar: se arma cuando la pantalla lo pide, solo en
// una perdida, contra la oferta adjudicada, y pide dejar sin efecto la
// adjudicación y evaluar de nuevo. Lo de aquí no llama a nadie.

/** Lo que acepta el campo «Motivo» del formulario de reclamos de Mercado
 *  Público (reclamos.mercadopublico.cl; medido el 05-11-2026 con el reclamo
 *  del Día del Profesor). */
export const MAX_DEL_RECLAMO = 3500;

/** Ley 19.886, art. 30 bis: la reclamación se presenta dentro de 5 días
 *  hábiles desde la notificación; art. 24 ter: la demanda ante el Tribunal
 *  de Contratación Pública, dentro de 10 (leídos en LeyChile el 11-11-2026). */
export const DIAS_PARA_RECLAMAR = 5;
export const DIAS_PARA_EL_TRIBUNAL = 10;

export type DatosDelReclamo = {
  codigo: string;
  nombre: string;
  organismo: string | null;
  empresa: Oferente | null;
  /** En una compra ágil no se adjudica: se selecciona una cotización. */
  esCompraAgil?: boolean;
};

/** A quién se adjudicó, como lo dice Mercado Público. */
export type Adjudicado = { rut: string | null; nombre: string };

/** El reclamo contra una oferta, listo para copiar. */
export type ReclamoArmado = {
  /** La razón social del oferente, como va en el texto. */
  contra: string;
  /** Cómo se llama en la pantalla (el nombre del cuadro de ofertas). */
  corto: string;
  /** La línea de la licitación; vacío si no tiene líneas. */
  linea: string;
  /** Mercado Público dice que se le adjudicó. */
  adjudicada: boolean;
  /** Los incumplimientos que van en el texto. */
  incumplimientos: number;
  /** Los que no cupieron en los 3.500 caracteres. */
  sin_lugar: number;
  /** Alguno es porque algo «no está» entre lo que presentó. */
  por_ausencia: boolean;
  /** null si la comparación no encontró nada que reclamarle. */
  texto: string | null;
  /** Lo que ocupa en el formulario. */
  caracteres: number;
};

const limpio = (t: string | null | undefined): string => t?.trim() || '';

/** Termina en punto, si no termina ya en uno (o en «!», «?»). */
const conPunto = (t: string): string => (/[.!?]$/.test(t) ? t : `${t}.`);

/** El formulario de reclamos borra, sin avisar, `$ ( ) / : ; « » °` y las
 *  comillas (medido el 05-11-2026): lo que la IA escribió con ellos quedaría
 *  mocho. El texto sale sin esos signos y dice lo mismo. */
export const paraElFormulario = (texto: string): string =>
  texto
    .split('\n')
    .map((linea) =>
      linea
        .replace(/[«»"“”„'‘’`´]/g, '')
        .replace(/\bN\s?[°º]\s*/gi, 'número ')
        .replace(/[°º]/g, '')
        .replace(/\$\s*([\d.,]*\d)/g, '$1 pesos')
        .replace(/\$/g, '')
        .replace(/(\d):(\d)/g, '$1.$2')
        .replace(/(\d)\/(\d)/g, '$1-$2')
        .replace(/\by\/o\b/gi, 'y o')
        .replace(/\//g, '-')
        .replace(/\s*[([]\s*/g, ', ')
        .replace(/\s*[)\]]/g, ',')
        .replace(/\s*[:;]/g, ',')
        .replace(/\s*·\s*/g, ', ')
        .replace(/[ \t]+/g, ' ')
        .replace(/\s+([,.])/g, '$1')
        .replace(/,(?:\s*,)+/g, ',')
        .replace(/,\s*\./g, '.')
        .replace(/^[,\s]+/, '')
        .replace(/[,\s]+$/, ''),
    )
    .join('\n');

/** Lo que ocupa en el formulario: ahí un salto de línea puede contar por
 *  dos, y se cuenta así para no pasarse. */
export const largoEnElFormulario = (texto: string): number =>
  texto.length + (texto.match(/\n/g)?.length ?? 0);

const cortado = (texto: string, largo: number): string =>
  texto.length <= largo
    ? texto
    : `${texto.slice(0, Math.max(0, largo - 3)).trimEnd()}...`;

/** El texto del reclamo contra una oferta, para después de la adjudicación:
 *  entra en los 3.500 caracteres del formulario y sin los signos que borra.
 *  Los incumplimientos van en orden mientras quepan; si ni el primero cabe,
 *  se acorta su regla. Devuelve además cuántos entraron. */
export function textoDelReclamo(
  competidor: string,
  graves: IncumplimientoGrave[],
  d: DatosDelReclamo,
  o: {
    /** La línea de la licitación, si tiene más de una (decisión 125). */
    linea?: string;
    /** Mercado Público dice que se le adjudicó a ese oferente. */
    adjudicada?: boolean;
    max?: number;
  } = {},
): { texto: string; incluidos: number } {
  const max = o.max ?? MAX_DEL_RECLAMO;
  const e = d.empresa;
  const empresa = limpio(e?.razon_social) || 'Nuestra empresa';
  const rut = limpio(e?.rut);
  const nombre = limpio(d.nombre);
  const linea = limpio(o.linea);
  const contacto = [
    limpio(e?.representante_correo) || limpio(e?.correo),
    limpio(e?.representante_telefono) || limpio(e?.telefono),
  ].filter(Boolean);
  const quien = `${empresa}${rut ? `, RUT ${rut}` : ''}`;
  const oferta = o.adjudicada
    ? `la oferta adjudicada, de ${competidor},`
    : `la oferta de ${competidor}`;
  const cabeza = paraElFormulario(
    [
      'Señores',
      limpio(d.organismo) || 'Organismo comprador',
      '',
      d.esCompraAgil
        ? `Reclamo por la selección de la compra ágil ${d.codigo}${nombre ? `, ${nombre}` : ''}.`
        : `Reclamo por la adjudicación de la licitación ${d.codigo}${nombre ? `, ${nombre}` : ''}.`,
      '',
      d.esCompraAgil
        ? `${quien}, que cotizó en esta compra ágil, reclama de la selección del proveedor, conforme al artículo 30 bis de la Ley 19.886. Según las cotizaciones publicadas en Mercado Público, ${oferta} incumple lo exigido en lo siguiente.`
        : `${quien}, oferente en esta licitación, reclama de la adjudicación${linea ? ` de ${linea}` : ''}, conforme al artículo 30 bis de la Ley 19.886. Según los documentos publicados en el cuadro de ofertas de Mercado Público, ${oferta} incumple las bases en lo siguiente.`,
    ].join('\n'),
  );
  const pie = paraElFormulario(
    [
      d.esCompraAgil
        ? 'Por lo anterior, solicitamos dejar sin efecto la selección y evaluar de nuevo las cotizaciones conforme a lo exigido en la compra.'
        : 'Por lo anterior, solicitamos dejar sin efecto la adjudicación, retrotraer el proceso a la etapa de evaluación y evaluar de nuevo las ofertas conforme a las bases.',
      '',
      ...[
        limpio(e?.representante_nombre),
        [limpio(e?.representante_cargo), empresa].filter(Boolean).join(', '),
        contacto.join(', '),
      ].filter(Boolean),
    ].join('\n'),
  );
  const bloque = (g: IncumplimientoGrave, n: number, regla = limpio(g.regla)) =>
    paraElFormulario(
      [
        `${n}. ${conPunto(limpio(g.que))}`,
        `Dónde se ve. ${conPunto(limpio(g.prueba))}`,
        `Regla. ${conPunto(regla)}`,
      ].join('\n'),
    );
  const armar = (bloques: string[]) => [cabeza, ...bloques, pie].join('\n\n');

  const bloques: string[] = [];
  for (const g of graves) {
    const con = [...bloques, bloque(g, bloques.length + 1)];
    if (largoEnElFormulario(armar(con)) > max) break;
    bloques.push(con[con.length - 1]);
  }
  if (bloques.length === 0 && graves.length > 0) {
    // Ni el primero cabe entero: va con la regla hasta donde alcance.
    const regla = paraElFormulario(limpio(graves[0].regla));
    const sinRegla = largoEnElFormulario(armar([bloque(graves[0], 1, '')]));
    bloques.push(
      bloque(graves[0], 1, cortado(regla, Math.max(0, max - sinRegla))),
    );
  }
  return { texto: armar(bloques), incluidos: bloques.length };
}

/** El nombre de un oferente sin adornos, para reconocerlo entre el cuadro de
 *  ofertas y la adjudicación: los dos salen del registro de Mercado Público,
 *  pero no siempre con las mismas mayúsculas, tildes ni puntos. */
const claveDelOferente = (nombre: string | null | undefined): string =>
  (nombre ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9ñ]+/g, ' ')
    .trim();

const esElMismo = (a: string, b: string): boolean => {
  const x = claveDelOferente(a);
  const y = claveDelOferente(b);
  if (!x || !y) return false;
  if (x === y) return true;
  // «Textum Burgos y Ortiz Limitada» y «TEXTUM BURGOS Y ORTIZ LTDA»: uno
  // contiene al otro, o se diferencian solo en cómo abrevian la sociedad.
  const sinSociedad = (t: string) =>
    t
      .replace(
        /\b(limitada|ltda|spa|s p a|s a|sa|eirl|e i r l|y cia|y compania|sociedad|comercial)\b/g,
        ' ',
      )
      .replace(/\s+/g, ' ')
      .trim();
  const p = sinSociedad(x);
  const q = sinSociedad(y);
  return (
    p.length >= 5 &&
    q.length >= 5 &&
    (p === q || p.includes(q) || q.includes(p))
  );
};

/** A quiénes se adjudicó lo que la empresa postuló. Con el acta leída, los
 *  adjudicados de los ítems en que aparece la oferta de la empresa (una
 *  licitación puede ir por línea: quien ganó otra línea no le ganó a ella).
 *  Sin acta, o si la empresa no aparece en ella, todos los elegidos que no
 *  son la empresa. */
export function adjudicadosFrenteALaEmpresa(
  acta: ActaDeAdjudicacion | null | undefined,
  publico: ResultadoPublico | null | undefined,
  rutDeLaEmpresa: string | null | undefined,
): Adjudicado[] {
  const rut = normalizarRut(rutDeLaEmpresa);
  const esLaEmpresa = (r: string | null | undefined) =>
    Boolean(rut) && normalizarRut(r) === rut;
  const unicos = (lista: Adjudicado[]): Adjudicado[] => {
    const vistos = new Set<string>();
    return lista.filter((a) => {
      const clave = normalizarRut(a.rut) || claveDelOferente(a.nombre);
      if (!clave || vistos.has(clave)) return false;
      vistos.add(clave);
      return true;
    });
  };
  const delActa = (acta?.items ?? [])
    .filter((i) => (i.ofertas ?? []).some((o) => esLaEmpresa(o.rut)))
    .flatMap((i) =>
      i.ofertas
        .filter((o) => o.adjudicada && !esLaEmpresa(o.rut))
        .map((o) => ({ rut: o.rut, nombre: o.proveedor })),
    );
  if (delActa.length > 0) return unicos(delActa);
  return unicos(
    (publico?.elegidos ?? [])
      .filter((o) => !esLaEmpresa(o.rut))
      .map((o) => ({ rut: o.rut, nombre: o.proveedor ?? '' })),
  );
}

/** Los reclamos de una perdida, con lo que encontró la comparación (decisión
 *  128). Solo en las líneas en que compite la empresa y nunca contra la
 *  suya. Lo que es «por ausencia» entra solo si se leyó todo lo de ese
 *  oferente (`lectura`; una comparación de antes de la 125 no la trae, y
 *  entra todo). Si se sabe a quién se adjudicó, solo contra esa oferta
 *  (aunque la comparación no le haya encontrado nada: `texto` null); si no
 *  se reconoce al adjudicado entre las ofertas comparadas, contra cada
 *  competidor con algo grave. */
export function reclamosDe(
  lineas: LineaComparada[],
  lectura: LecturaDeUnaOferta[] | null | undefined,
  d: DatosDelReclamo,
  adjudicados: Adjudicado[],
): ReclamoArmado[] {
  const completas = lectura
    ? new Set(
        lectura
          .filter((l) => l.sin_leer.length === 0 && l.sin_traer.length === 0)
          .map((l) => l.oferta),
      )
    : null;
  const candidatos = lineas
    .filter((l) => l.compites)
    .flatMap((l) =>
      l.oferentes
        .filter((o) => !o.es_tuya)
        .map((o) => ({
          linea: l.nombre,
          oferente: o,
          graves: (o.graves ?? []).filter(
            (g) =>
              !g.por_ausencia || !completas || completas.has(o.oferta ?? 0),
          ),
          adjudicada: adjudicados.some(
            (a) =>
              esElMismo(a.nombre, o.corto ?? '') ||
              esElMismo(a.nombre, o.nombre),
          ),
        })),
    );
  const seSabe = candidatos.some((c) => c.adjudicada);
  return candidatos
    .filter((c) => (seSabe ? c.adjudicada : c.graves.length > 0))
    .map((c): ReclamoArmado => {
      const base = {
        contra: c.oferente.nombre,
        corto: limpio(c.oferente.corto) || c.oferente.nombre,
        linea: c.linea,
        adjudicada: c.adjudicada,
      };
      if (c.graves.length === 0) {
        return {
          ...base,
          incumplimientos: 0,
          sin_lugar: 0,
          por_ausencia: false,
          texto: null,
          caracteres: 0,
        };
      }
      const { texto, incluidos } = textoDelReclamo(
        c.oferente.nombre,
        c.graves,
        d,
        { linea: c.linea, adjudicada: c.adjudicada },
      );
      return {
        ...base,
        incumplimientos: incluidos,
        sin_lugar: c.graves.length - incluidos,
        por_ausencia: c.graves.slice(0, incluidos).some((g) => g.por_ausencia),
        texto,
        caracteres: largoEnElFormulario(texto),
      };
    });
}

/** «19/12/2025 17:39» o «2026-11-04T00:00:00» → «2026-11-04»; null si no es
 *  una fecha. */
const soloElDia = (texto: unknown): string | null => {
  if (typeof texto !== 'string') return null;
  const chilena = /^\s*(\d{2})\/(\d{2})\/(\d{4})/.exec(texto);
  if (chilena) return `${chilena[3]}-${chilena[2]}-${chilena[1]}`;
  return /^\s*(\d{4}-\d{2}-\d{2})/.exec(texto)?.[1] ?? null;
};

/** El día en que se publicó la adjudicación: el «Informada en portal» del
 *  acta si se leyó; si no, la fecha de la adjudicación. */
export const diaDeLaAdjudicacion = (proceso: {
  adjudicacion?: unknown;
  acta?: unknown;
}): string | null =>
  soloElDia((proceso.acta as { informada?: unknown } | null)?.informada) ??
  soloElDia((proceso.adjudicacion as { fecha?: unknown } | null)?.fecha);

/** El día en que se cumplen `dias` días hábiles después de `desde`
 *  (AAAA-MM-DD). No descuenta feriados: da la fecha más temprana posible, la
 *  que nunca queda fuera de plazo. `conSabados`: el sábado cuenta como hábil
 *  (ante un tribunal puede contar; en un trámite administrativo, no). */
export function diasHabilesDespues(
  desde: string,
  dias: number,
  conSabados = false,
): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(desde);
  if (!m) return null;
  const dia = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(dia.getTime())) return null;
  for (let contados = 0; contados < dias; ) {
    dia.setUTCDate(dia.getUTCDate() + 1);
    const d = dia.getUTCDay();
    if (d !== 0 && (conSabados || d !== 6)) contados += 1;
  }
  return dia.toISOString().slice(0, 10);
}
