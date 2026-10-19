import { normalizar } from '../mercado-publico/mapeo';

// LAS REGLAS QUE MANDAN SOBRE LA IA (doc 17 §5.2). Funciones puras.

export type Semaforo = 'verde' | 'amarillo' | 'rojo';

export const ETIQUETAS = [
  'evento',
  'alimentacion',
  'alojamiento',
  'capacitacion_con_salon',
  'paseo',
  'otro',
] as const;
export type Etiqueta = (typeof ETIQUETAS)[number];

/** Lo que devuelve la IA por cada proceso. */
export type Lectura = {
  semaforo: Semaforo;
  etiquetas: Etiqueta[];
  se_hace_en_el_complejo: 'si' | 'no' | 'dudoso';
  razon: string;
};

const SEMAFOROS: readonly Semaforo[] = ['verde', 'amarillo', 'rojo'];
const LUGARES: ReadonlyArray<Lectura['se_hace_en_el_complejo']> = [
  'si',
  'no',
  'dudoso',
];

/** «Rojo.», «Sí», « amarillo » → rojo, si, amarillo. */
const limpio = (v: unknown): string =>
  typeof v === 'string'
    ? v
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z_]/g, '')
    : '';

/** LO QUE CONTESTÓ LA IA, REVISADO ANTES DE GUARDARLO (18-10 en la noche:
 *  un color fuera de verde, amarillo o rojo hizo que la base rechazara la
 *  fila —oportunidades_semaforo_check— y se cayó la pasada entera de las
 *  23:07). Se limpia lo que se puede («Rojo.» es rojo) y las etiquetas que
 *  no existen se botan. null = no se puede usar: queda en amarillo para
 *  revisar a mano, como cuando la IA no contesta. */
export const lecturaValida = (salida: {
  semaforo?: unknown;
  etiquetas?: unknown;
  se_hace_en_el_complejo?: unknown;
  razon?: unknown;
}): Lectura | null => {
  const semaforo = SEMAFOROS.find((s) => s === limpio(salida.semaforo));
  const lugar = LUGARES.find(
    (l) => l === limpio(salida.se_hace_en_el_complejo),
  );
  if (!semaforo || !lugar) return null;
  const etiquetas = (Array.isArray(salida.etiquetas) ? salida.etiquetas : [])
    .map(limpio)
    .filter((e): e is Etiqueta => (ETIQUETAS as readonly string[]).includes(e));
  return {
    semaforo,
    etiquetas: etiquetas.length > 0 ? [...new Set(etiquetas)] : ['otro'],
    se_hace_en_el_complejo: lugar,
    razon: typeof salida.razon === 'string' ? salida.razon.trim() : '',
  };
};

/** Cómo queda marcada una oportunidad cuyo color lo puso el análisis de
 *  las bases (Opus 5.5, MODELO_OPUS; decisión 21 del doc 17): manda sobre
 *  la lectura corta del radar, que ya no la relee. Escrito aquí y no
 *  importado de analisis/comun para no arrastrar el SDK al repositorio. */
export const LEIDA_SEGUN_LAS_BASES =
  'claude-opus-5-5, según el análisis de las bases';

/** La lectura con las reglas aplicadas: lo que se guarda. */
export type LecturaFinal = Lectura & {
  /** comuna_cercana | alto_valor: piden aviso inmediato (sprint 2). */
  alertas: string[];
};

export type DondeCompra = {
  comuna?: string | null;
  organismo?: string | null;
  unidad?: string | null;
};

/** ¿El comprador es de una comuna cercana? Mira la comuna, el organismo y
 *  la unidad ("I. Municipalidad de Quillón", "DAEM Quillón"), palabra
 *  entera para que "Florida" no calce dentro de otra palabra. */
export const esDeComunaCercana = (
  proceso: DondeCompra,
  comunas: string[],
): boolean => {
  const donde = ` ${normalizar(
    [proceso.comuna, proceso.organismo, proceso.unidad]
      .filter(Boolean)
      .join(' '),
  )} `;
  return comunas.some((comuna) => {
    const n = normalizar(comuna);
    return n.length > 2 && donde.includes(` ${n} `);
  });
};

/**
 * Comuna cercana y del rubro → nunca rojo, y alerta. Que sea "del rubro"
 * importa: la Municipalidad de Quillón también compra hormigón e insumos
 * dentales, y eso no es ruido que haya que mostrar (afinado del doc 17
 * §5.2, 16-10). Monto igual o mayor al de alto valor de la empresa, si no
 * quedó en rojo → alerta.
 */
export const aplicarReglas = (
  lectura: Lectura,
  proceso: DondeCompra & { monto?: number | null },
  opciones: { comunasCercanas: string[]; umbralAltoValor: number | null },
): LecturaFinal => {
  const alertas: string[] = [];
  let semaforo = lectura.semaforo;

  const delRubro = lectura.etiquetas.some((e) => e !== 'otro');
  if (delRubro && esDeComunaCercana(proceso, opciones.comunasCercanas)) {
    alertas.push('comuna_cercana');
    if (semaforo === 'rojo') semaforo = 'amarillo';
  }

  const umbral = opciones.umbralAltoValor;
  if (
    semaforo !== 'rojo' &&
    umbral &&
    umbral > 0 &&
    proceso.monto &&
    proceso.monto >= umbral
  ) {
    alertas.push('alto_valor');
  }

  return { ...lectura, semaforo, alertas };
};
