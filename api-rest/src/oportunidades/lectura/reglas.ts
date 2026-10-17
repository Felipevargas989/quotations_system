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
