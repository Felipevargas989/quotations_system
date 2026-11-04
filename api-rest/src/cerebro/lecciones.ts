import type { Tarea } from './cerebro';

// LO QUE APRENDIÓ BELIA (doc 20 §17, mejora 5; Felipe, 04-11-2026: «que
// aprenda de tus correcciones ... tú la apruebas»).
//
// Las lecciones viven en la base (`cerebro_lecciones`, migración 185). Las
// aprobadas se guardan acá, en la memoria del motor, para que `cerebroPara`
// las sume al final de lo que lee cada IA sin ir a la base en cada pregunta:
// las trae `LeccionesService` al arrancar, cada 5 minutos y apenas una
// cambia. Si la base no responde, cada IA sigue con los archivos.

/** Las de la migración 185: postular lee solo las de todas. */
export type TareaDeLeccion = 'todas' | 'armar' | 'escribir' | 'conversar';
export const TAREAS_DE_LECCION: readonly TareaDeLeccion[] = [
  'todas',
  'armar',
  'escribir',
  'conversar',
];

export type EstadoDeLeccion =
  | 'pendiente'
  | 'aprobada'
  | 'descartada'
  | 'olvidada';

export type Leccion = {
  id: string;
  company_id: number;
  tarea: TareaDeLeccion;
  texto: string;
  motivo: string | null;
  estado: EstadoDeLeccion;
  propuesta_por_nombre: string | null;
  decidida_por_nombre: string | null;
  decidida_at: string | null;
  created_at: string;
};

/** Para qué vale, en palabras de la casa. */
export const TAREA_EN_PALABRAS: Record<TareaDeLeccion, string> = {
  todas: 'toda la IA de Eventia',
  armar: 'armar cotizaciones',
  escribir: 'escribir los correos de seguimiento',
  conversar: 'BelIA en el chat',
};

const aprobadas = new Map<number, Leccion[]>();

/** Las aprobadas de una empresa, como las trajo la base. */
export const guardarAprobadas = (empresa: number, lista: Leccion[]): void => {
  aprobadas.set(
    empresa,
    lista.filter((l) => l.estado === 'aprobada'),
  );
};

/** Todas las aprobadas de una vez (la carga del arranque y cada 5 min): la
 *  empresa que ya no tiene ninguna queda sin lecciones. */
export const reemplazarTodas = (porEmpresa: Map<number, Leccion[]>): void => {
  aprobadas.clear();
  for (const [empresa, lista] of porEmpresa) guardarAprobadas(empresa, lista);
};

export const aprobadasDe = (empresa: number): Leccion[] =>
  aprobadas.get(empresa) ?? [];

/** Lo que se suma al final del cerebro para esta tarea, o null si no hay
 *  ninguna. BelIA (conversar) las lee todas, como lee todo el cerebro. */
export const seccionDeLecciones = (
  lista: Leccion[],
  tarea: Tarea,
): string | null => {
  const valen = lista.filter(
    (l) => tarea === 'conversar' || l.tarea === 'todas' || l.tarea === tarea,
  );
  if (valen.length === 0) return null;
  return [
    '# Lo que aprendió BelIA',
    '',
    'Lecciones de las correcciones del equipo, aprobadas por administración en Eventia. Valen como las reglas de arriba.',
    '',
    ...valen.map((l) =>
      tarea === 'conversar' && l.tarea !== 'todas'
        ? `- ${l.texto} (para ${TAREA_EN_PALABRAS[l.tarea]})`
        : `- ${l.texto}`,
    ),
  ].join('\n');
};
