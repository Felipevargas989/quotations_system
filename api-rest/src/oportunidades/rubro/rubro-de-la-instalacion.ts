// EL RUBRO DE LA INSTALACIÓN (rebanada 1a de Licita, 25-11). El mismo motor
// se instala dos veces: en Eventia, para un complejo de eventos (Valle del
// Sol), y en Licita (FISCOPIO), para empresas de cualquier rubro. Lo que la
// IA entiende por «del rubro» deja de estar escrito en el código y pasa a ser
// un dato: las etiquetas y las instrucciones de la lectura del radar, del
// filtro de candidatas de la historia y de Competidores.
//
// Cuál rige lo decide la instalación con OPORTUNIDADES_RUBRO: «eventos» o
// «general». Si falta o trae otra cosa, el de fábrica de la instalación
// (paso 2, `src/instalacion/`): «eventos» en Eventia, «general» con
// INSTALACION=licita. Nada de columnas.
//
// «eventos» son EXACTAMENTE los textos de antes, movidos sin tocar una letra
// (la prueba `el-rubro-de-eventos-no-cambia.spec.ts` lo amarra a una huella):
// si cambiaran, producción releería todo. «general» se apoya solo en el
// perfil que escribe cada empresa (qué vende, dónde, qué no hace).
//
// Módulo puro: sin SDK ni Nest.

import { esLicita } from 'src/instalacion/instalacion';

export const RUBROS = ['eventos', 'general'] as const;
export type Rubro = (typeof RUBROS)[number];

/** El de fábrica, si OPORTUNIDADES_RUBRO no lo dice: `eventos` en Eventia y
 *  `general` en Licita (paso 2: un solo interruptor, INSTALACION, para las
 *  dos cosas). */
export const rubroDeFabrica = (
  laInstalacion: string | undefined = process.env.INSTALACION,
): Rubro => (esLicita(laInstalacion) ? 'general' : 'eventos');

/** El rubro de esta instalación: el que diga OPORTUNIDADES_RUBRO
 *  (`eventos` o `general`); si falta o trae otra cosa, el de fábrica de la
 *  instalación (`eventos` en Eventia). Se lee en cada llamada, no al
 *  importar: el .env lo carga Nest después de los imports. */
export const rubroDeLaInstalacion = (
  valor: string | undefined = process.env.OPORTUNIDADES_RUBRO,
  deFabrica: Rubro = rubroDeFabrica(),
): Rubro => {
  const dicho = (valor ?? '').trim().toLowerCase();
  return dicho === 'general' || dicho === 'eventos' ? dicho : deFabrica;
};

/** Lo que la IA necesita saber de la empresa. */
export type PerfilDeEmpresa = {
  nombre: string;
  perfil: string | null;
  paquetes: string[];
  fijos: string[];
};

export const ETIQUETAS_DE_EVENTOS = [
  'evento',
  'alimentacion',
  'alojamiento',
  'capacitacion_con_salon',
  'paseo',
  'otro',
] as const;

/** En `general` hay una sola etiqueta del rubro: lo que la empresa vende es
 *  lo que ella escribe, no una lista fija. Sigue la regla de siempre: «del
 *  rubro» es tener alguna etiqueta distinta de `otro`. */
export const ETIQUETAS_GENERALES = ['del_rubro', 'otro'] as const;

type DefinicionDelRubro = {
  /** Las que puede devolver la lectura del radar (van al esquema). */
  etiquetas: readonly string[];
  /** Con qué reglas se leyó: va en `LECTURA_ACTUAL` detrás del modelo. */
  reglasDeLectura: string;
  /** Lo que se anota en `oportunidades_rubro.modelo` detrás del modelo. */
  versionDeCompetidores: string;
  lectura: (empresa: PerfilDeEmpresa) => string;
  candidatas: (perfil: string | null) => string;
  competidores: (perfil: string | null) => string;
};

// ─── eventos: los textos de siempre, movidos tal cual ─────────────────────

/** El filtro de la historia (doc 17 §5.1, punto 6): de las licitaciones de un
 *  día, solo por el nombre, las que podrían ser de un negocio de eventos.
 *  Amplio a propósito: lo que pasa este filtro se pide entero y se lee con
 *  calma; lo que no pasa, no se mira más. */
const CANDIDATAS_DE_EVENTOS = [
  'Te paso una lista numerada de nombres de licitaciones de Mercado Público (Chile).',
  'Devuelve los números de las que PODRÍAN ser de servicios para un complejo de eventos, turismo y gastronomía:',
  'eventos, ceremonias, celebraciones, aniversarios, fiestas, galas, día del profesor, día del funcionario, día de la madre, navidad;',
  'alimentación preparada (almuerzos, cenas, coffee break, colaciones, cócteles, banquetería, catering);',
  'alojamiento u hospedaje; arriendo de salones, recintos o centros de eventos;',
  'capacitaciones, jornadas, seminarios o talleres que necesiten un lugar; paseos, viajes recreativos, giras, campamentos, actividades de esparcimiento.',
  'NO devuelvas compras de insumos, materiales, equipos, vehículos, obras, mantención, salud, aseo, ni servicios profesionales sin evento.',
  'Ante la duda, inclúyela.',
].join('\n');

const lecturaDeEventos = (empresa: PerfilDeEmpresa): string =>
  [
    `Lees licitaciones y compras ágiles de Mercado Público (Chile) para la empresa "${empresa.nombre}" y decides si le sirven.`,
    'La categoría que pone el comprador suele estar mal: decide por el nombre, la descripción y los productos que pide.',
    '',
    'LA EMPRESA',
    empresa.perfil?.trim() || '(sin descripción)',
    '',
    'SU CATÁLOGO EN EVENTIA',
    `Paquetes: ${empresa.paquetes.join('; ') || '(ninguno)'}`,
    `Servicios fijos: ${empresa.fijos.join('; ') || '(ninguno)'}`,
    '',
    'RESPONDE',
    '- etiquetas: qué pide el proceso, una o varias de: evento, alimentacion, alojamiento, capacitacion_con_salon, paseo, otro. Usa "otro" solo si no pide nada de las demás.',
    '- se_hace_en_el_complejo: "si" si el servicio se puede prestar en las instalaciones de la empresa o el lugar lo propone el oferente; "no" si exige hacerlo en dependencias del comprador o en otra ciudad, si es comida a domicilio o si es solo entrega de productos; "dudoso" si no lo dice.',
    '  Las celebraciones son la excepción: ceremonias, cenas y almuerzos de celebración, aniversarios, fiestas (también de fin de año), paseos, jornadas recreativas o de autocuidado y días del funcionario, del profesor o del dirigente, para un grupo, se hacen en un centro de eventos, porque un comprador público no tiene salón de banquetes. Si la empresa tiene recinto propio y la celebración no dice dónde, es "si". Las capacitaciones, jornadas de trabajo y talleres que no dicen dónde siguen "dudoso": suelen hacerse donde el comprador.',
    '  Un evento público del comprador (feria, festival, show, fonda, malón, teletón o actividad abierta a la comunidad) se hace en un espacio suyo (plaza, gimnasio, estadio): es "no", salvo que pida un recinto que proponga el oferente. Un evento para sus funcionarios o para un grupo cerrado sigue la regla de las celebraciones.',
    '- semaforo: "verde" si es del rubro de la empresa y se_hace_en_el_complejo es "si"; "amarillo" si es del rubro pero hay una duda que conviene revisar (lugar "dudoso", mezcla con cosas que no vende); "rojo" si no es del rubro, si exige hacerse fuera de la empresa o si es compra de productos.',
    '  Una capacitación, curso, taller o seminario en que se compra el curso, el relator, el monitor o el contenido NO es del rubro de una empresa que pone el lugar: "rojo". Es del rubro cuando piden el lugar (salón), la alimentación o el alojamiento para la actividad.',
    '  Lo que la descripción de la empresa marca POR EVALUAR va "amarillo", aunque se haga fuera de la empresa: lo quiere ver para decidir. En ese caso se_hace_en_el_complejo dice la verdad ("no" si es donde el comprador) y la razón dice que está por evaluar. Si lo POR EVALUAR pide un monto mínimo y el proceso informa un monto menor, no está por evaluar: sigue la regla de siempre.',
    '- razon: una frase corta en español que diga por qué.',
    '',
    'EJEMPLOS (casos reales de Mercado Público)',
    '- «Curso de capacitación manejo avanzado de heridas»: compran el curso, no el lugar → rojo.',
    '- «Salón implementado para capacitación y servicio de alimentación»: piden el salón y la comida → del rubro (si no dice dónde, amarillo).',
    '- «Servicio de producción para shows de la Teletón», de una municipalidad: evento público en la comuna → rojo.',
    '- «Jornada de autocuidado, deportiva y recreativa para funcionarios»: jornada de un grupo cerrado, como una celebración → si no dice dónde, "si".',
    '- «Servicio de coffee break para 30 participantes» por $150.000, con el catering POR EVALUAR desde $1.000.000: no llega al monto → la regla de siempre (rojo si se sirve donde el comprador).',
  ].join('\n');

const competidoresDeEventos = (perfil: string | null): string =>
  [
    'Revisas licitaciones públicas de Chile para una empresa que da estos servicios:',
    perfil?.trim() ||
      '(complejo turístico con salones, restaurante y cabañas, que da alimentación y eventos)',
    '',
    'Una línea es DEL RUBRO solo si el proveedor da COMIDA, un SALÓN o recinto, o ALOJAMIENTO a un grupo de personas: almuerzos, cenas, desayunos, onces, cóctel, coffee break, colaciones, banquetería o catering para una actividad; paseos y jornadas recreativas o de autocuidado con comida o en un recinto; arriendo de salón o de centro de eventos; alojamiento.',
    'Las celebraciones de funcionarios o de grupos (día del funcionario, del profesor, del asistente de la educación, de la madre, del adulto mayor, aniversarios institucionales, navidad o fin de año, convivencias) son del rubro aunque digan "producción de evento", porque llevan comida o recinto.',
    'NO son del rubro: la producción técnica o artística (audio, amplificación, iluminación, escenarios, pantallas, carpas, animación, artistas, shows, "producción técnica y artística"); los festivales, ferias, exposiciones, conciertos, fiestas costumbristas y aniversarios comunales abiertos al público, salvo que la línea diga que el proveedor da la comida; las concesiones de casino o cafetería permanentes; la compra o el suministro de alimentos o abarrotes; el transporte; la capacitación y los cursos; impresiones, regalos, vestuario, aseo y todo lo demás.',
    'Si la línea no deja claro que el proveedor da comida, salón o alojamiento, es "no". Ante la duda, "no".',
    'Cada licitación viene con su código, su nombre y sus líneas numeradas. Por cada una responde: "codigo" tal cual; "del_rubro": "si" si todas sus líneas son del rubro, "parcial" si solo algunas, "no" si ninguna; "lineas": los números de las líneas del rubro (vacío si "no"); y una "razon" de menos de 12 palabras.',
  ].join('\n');

// ─── general: para cualquier empresa, solo con lo que ella escribe ────────

const lecturaGeneral = (empresa: PerfilDeEmpresa): string => {
  const cargados =
    empresa.paquetes.length > 0 || empresa.fijos.length > 0
      ? [
          '',
          'SERVICIOS QUE TIENE CARGADOS',
          ...(empresa.paquetes.length > 0
            ? [`Paquetes: ${empresa.paquetes.join('; ')}`]
            : []),
          ...(empresa.fijos.length > 0
            ? [`Servicios fijos: ${empresa.fijos.join('; ')}`]
            : []),
        ]
      : [];
  return [
    `Lees licitaciones y compras ágiles de Mercado Público (Chile) para la empresa "${empresa.nombre}" y decides si le sirven.`,
    'La categoría que pone el comprador suele estar mal: decide por el nombre, la descripción y los productos que pide.',
    'De la empresa sabes solo lo que ella escribió: qué vende, dónde trabaja y qué no hace. No le supongas otros servicios ni otra zona.',
    '',
    'LA EMPRESA',
    empresa.perfil?.trim() || '(sin descripción)',
    ...cargados,
    '',
    'RESPONDE',
    '- etiquetas: "del_rubro" si el proceso pide, en todo o en parte, algo de lo que la empresa vende; "otro" si no pide nada de eso.',
    '- se_hace_en_el_complejo: aquí quiere decir si la empresa lo puede prestar. "si" si lo que piden calza con lo que la empresa describe y con la zona donde trabaja; "no" si exige algo que su descripción dice que no hace, si es fuera de su zona o si en verdad es otra cosa (por ejemplo, la compra de productos cuando la empresa presta un servicio, o al revés); "dudoso" si al proceso o a la descripción les falta información para decidir.',
    '  Cuenta lo que el comprador contrata, no el tema: que el nombre se parezca a lo que la empresa hace no basta.',
    '- semaforo: "verde" si es del rubro y se_hace_en_el_complejo es "si"; "amarillo" si es del rubro pero hay una duda que conviene revisar (se_hace_en_el_complejo "dudoso", o mezcla lo que vende con cosas que no vende); "rojo" si no es del rubro, o si lo es pero la empresa no lo puede prestar (se_hace_en_el_complejo "no").',
    '  Lo que la descripción de la empresa marca POR EVALUAR va "amarillo", aunque no calce del todo: lo quiere ver para decidir. En ese caso se_hace_en_el_complejo dice la verdad y la razón dice que está por evaluar. Si lo POR EVALUAR pide un monto mínimo y el proceso informa un monto menor, no está por evaluar: sigue la regla de siempre.',
    '  Sin descripción de la empresa no adivines: lo que no puedas juzgar va "amarillo", con se_hace_en_el_complejo "dudoso".',
    '- razon: una frase corta en español que diga por qué.',
  ].join('\n');
};

/** El filtro de la historia para cualquier empresa: amplio a propósito, como
 *  el de eventos. Sin descripción no hay con qué descartar. */
const candidatasGenerales = (perfil: string | null): string =>
  [
    'Te paso una lista numerada de nombres de licitaciones de Mercado Público (Chile).',
    'Devuelve los números de las que PODRÍAN servirle a una empresa que dice esto de sí misma:',
    perfil?.trim() ||
      '(sin descripción: no hay con qué descartar, devuélvelas todas)',
    'NO devuelvas las que claramente son de otra cosa, ni lo que la descripción dice que no hace.',
    'Ante la duda, inclúyela.',
  ].join('\n');

const competidoresGenerales = (perfil: string | null): string =>
  [
    'Revisas licitaciones públicas de Chile para una empresa que da estos servicios:',
    perfil?.trim() ||
      '(la empresa no escribió qué vende: sin eso no hay rubro, responde "no" en todas)',
    '',
    'Una línea es DEL RUBRO solo si el proveedor que la gana entrega algo de lo que esta empresa vende, tal como ella lo describe. Cuenta lo que el proveedor da, no el tema: que la línea se parezca no basta.',
    'NO son del rubro: lo que la descripción dice que la empresa no hace, y todo lo demás.',
    'Si la línea no deja claro que el proveedor da algo de lo que la empresa vende, es "no". Ante la duda, "no".',
    'Cada licitación viene con su código, su nombre y sus líneas numeradas. Por cada una responde: "codigo" tal cual; "del_rubro": "si" si todas sus líneas son del rubro, "parcial" si solo algunas, "no" si ninguna; "lineas": los números de las líneas del rubro (vacío si "no"); y una "razon" de menos de 12 palabras.',
  ].join('\n');

export const DEFINICION_DEL_RUBRO: Readonly<Record<Rubro, DefinicionDelRubro>> =
  {
    eventos: {
      etiquetas: ETIQUETAS_DE_EVENTOS,
      reglasDeLectura: 'reglas del 11-11, monto mínimo',
      versionDeCompetidores: 'v2',
      lectura: lecturaDeEventos,
      candidatas: () => CANDIDATAS_DE_EVENTOS,
      competidores: competidoresDeEventos,
    },
    general: {
      etiquetas: ETIQUETAS_GENERALES,
      reglasDeLectura: 'reglas generales v1',
      versionDeCompetidores: 'general-v1',
      lectura: lecturaGeneral,
      candidatas: candidatasGenerales,
      competidores: competidoresGenerales,
    },
  };

/** Las etiquetas que valen en `rubro`. */
export const etiquetasDe = (rubro: Rubro = 'eventos'): readonly string[] =>
  DEFINICION_DEL_RUBRO[rubro].etiquetas;

/** El filtro de candidatas de la historia. `perfil` solo lo usa `general`. */
export const instruccionesDeCandidatas = (
  rubro: Rubro = 'eventos',
  perfil: string | null = null,
): string => DEFINICION_DEL_RUBRO[rubro].candidatas(perfil);
