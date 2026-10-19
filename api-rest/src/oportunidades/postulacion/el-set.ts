import type { Origen } from '../adjuntos/adjuntos.repository';
import { NOMBRES_DE_DOCUMENTO } from '../analisis/validacion.service';
import { sinExtension } from '../generacion/formularios';
import type { DocumentoDeEmpresa } from '../oferente/oferente.repository';
import { type DatosDeRespaldo, TIPO_RESPALDO } from '../oferente/respaldo';

// EL SET PARA MERCADO PÚBLICO (decisión 34 del doc 17, sprint I, 19-10).
// Felipe: "al momento de generar el set de documentos que tengo que subir
// al mercado público, debería descargarse y adjuntarse estos mismos
// documentos". Qué va en el ZIP, en qué carpeta y qué falta, SIN IA: se
// decide con lo que ya está (los archivos de «Mi postulación», el análisis
// de las bases y la carpeta de «Mi empresa»), para que salga igual cada vez.
//
// - De los anexos que hizo la IA, la última corrida, y de cada uno su
//   versión firmada si la hay. Van a la carpeta que dicen las bases
//   (`formularios[].se_entrega_en` del análisis); un Word con formularios
//   de dos partes va en las dos.
// - La propuesta técnica, la más nueva, en la técnica.
// - Lo que se subió a mano a «Mi postulación», todo.
// - De la carpeta de la empresa, solo lo que piden las bases (más es menos,
//   decisión 32), y no si las bases traen su formato como formulario.
// - Los respaldos de experiencia cuyo número aparece en los anexos o la
//   propuesta: los de la experiencia declarada (`conLosRespaldos`).
// - Los documentos generales para contratar (decisión 38, 19-10): e-RUT,
//   patente, no quiebra, estatutos y vigencia, en «4. Otros» cuando las
//   bases no los piden en otra parte.

export type Carpeta = 'administrativa' | 'tecnica' | 'economica' | 'otros';

/** Las tres partes donde el portal pide los anexos al ingresar la oferta,
 *  y una cuarta con lo general para contratar (Felipe, 19-10: "debería
 *  haber un cuarto que son otros... los generales de las licitaciones para
 *  contratar"). */
export const CARPETAS: Readonly<Record<Carpeta, string>> = {
  administrativa: '1. Administrativa',
  tecnica: '2. Técnica',
  economica: '3. Económica',
  otros: '4. Otros',
};

export type ArchivoDelSet = {
  id: number;
  nombre: string;
  ruta: string;
  bytes: number;
  seccion: 'bases' | 'postulacion';
  origen: Origen;
  viene_de: number | null;
  /** El trabajo de la IA que lo hizo (migración 129). */
  generacion_id: number | null;
  creado_en: string;
};

export type FormularioDeLasBases = {
  nombre: string;
  archivo: string;
  aplica: boolean;
  se_entrega_en: string;
};

export type DatosDelSet = {
  archivos: ArchivoDelSet[];
  formularios: FormularioDeLasBases[];
  requisitos: Array<{ que: string }>;
  carpeta: DocumentoDeEmpresa[];
  /** Cuándo empezó cada trabajo de la IA, por su id. */
  inicioDe: ReadonlyMap<number, string>;
  /** Cuándo quedó lista la última oferta armada (decisión 33). */
  ofertaLista: string | null;
  /** AAAA-MM-DD: el cierre en Chile (o hoy), contra el que se vence. */
  corte: string;
};

export type PiezaDelSet = {
  nombre: string;
  ruta: string;
  bytes: number;
  carpetas: Carpeta[];
  /** Una carpeta dentro de la carpeta (los respaldos van juntos). */
  subcarpeta?: string;
  que_es: 'formulario' | 'propuesta' | 'subido' | 'documento' | 'respaldo';
  aviso: string | null;
  /** El Word del que se lee el texto (los números de los respaldos): el
   *  firmado se sube en PDF, pero dice lo mismo que su Word. */
  texto?: { ruta: string; nombre: string };
};

export type ElSet = { piezas: PiezaDelSet[]; faltan: string[] };

export const normalizar = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();

/** «Anexo N°3», «Formulario 2», «ANEXO Nº 1»: su clase y su número. */
const numeroDe = (t: string): string | null => {
  const m = /\b(anexo|formulario|formato)\s*(?:n\s*[°º.o]*\s*)?(\d+)/.exec(
    normalizar(t),
  );
  return m ? `${m[1]} ${m[2]}` : null;
};

/** El nombre sin extensión, sin « - lleno» ni « - firmado» y sin signos. */
const nucleo = (t: string): string =>
  normalizar(sinExtension(t))
    .replace(/ - (lleno|firmado)$/, '')
    .replace(/[^a-z0-9°º ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/** ¿Este archivo es ese formulario? Por su número si los dos lo tienen; si
 *  no, porque un nombre contiene al otro. */
export const mismoFormulario = (formulario: string, archivo: string) => {
  const a = numeroDe(formulario);
  const b = numeroDe(archivo);
  if (a && b) return a === b;
  const f = nucleo(formulario);
  const n = nucleo(archivo);
  return f.length >= 6 && n.length >= 6 && (n.includes(f) || f.includes(n));
};

const mismoArchivo = (a: string, b: string) =>
  a.trim() !== '' && nucleo(a) === nucleo(b);

const carpetaDe = (seEntregaEn: string): Carpeta =>
  seEntregaEn === 'tecnica' || seEntregaEn === 'economica'
    ? seEntregaEn
    : 'administrativa';

/** Sin formulario que lo diga, la carpeta por el nombre. */
const carpetaPorNombre = (nombre: string): Carpeta => {
  const n = normalizar(nombre);
  if (/econom|precio/.test(n)) return 'economica';
  if (/tecnic|propuesta|experiencia/.test(n)) return 'tecnica';
  return 'administrativa';
};

const sinRepetir = <T>(xs: T[]): T[] => [...new Set(xs)];

const fechaCorta = (iso: string) =>
  iso.slice(0, 10).split('-').reverse().join('-');

/** Cómo se reconoce cada tipo de la carpeta de la empresa en lo que piden
 *  las bases (o en el nombre de un archivo). */
const PATRONES: Readonly<Record<string, RegExp>> = {
  patente: /patente/,
  inicio_actividades: /inicio de actividades|iniciacion de actividades/,
  programa_integridad: /programa de integridad/,
  f30: /\bf ?-?30\b|antecedentes laborales|obligaciones laborales/,
  vigencia:
    /certificado de vigencia|vigencia de la (sociedad|empresa|persona juridica)/,
  resolucion_sanitaria: /resolucion sanitaria|autorizacion sanitaria/,
  dj_trabajadores:
    /declaracion jurada (simple )?de (los )?trabajadores|nomina de (los )?trabajadores/,
  erut: /\be ?-?rut\b|rut electronico/,
  no_quiebra: /quiebra|procedimiento concursal|boletin concursal/,
  estatutos:
    /estatutos?\b|escritura de constitucion|constitucion de (la )?sociedad/,
};

const conSuPatron = (tipo: string): [tipo: string, patron: RegExp] => [
  tipo,
  PATRONES[tipo],
];

/** Lo que las bases piden de la carpeta de la empresa, por tipo: si lo
 *  piden, va en la administrativa (o falta). */
const LO_QUE_PIDEN: ReadonlyArray<[tipo: string, patron: RegExp]> = [
  'patente',
  'inicio_actividades',
  'programa_integridad',
  'f30',
  'vigencia',
  'resolucion_sanitaria',
  'dj_trabajadores',
].map(conSuPatron);

/** Lo general para contratar (decisión 38): en «4. Otros», salvo lo que
 *  las bases ya piden en la administrativa (la patente, la vigencia). El
 *  e-RUT, la no quiebra y los estatutos van siempre ahí: las bases suelen
 *  nombrarlos dentro de una declaración jurada, y pedirlos sería una falsa
 *  alarma. */
const GENERALES: ReadonlyArray<[tipo: string, patron: RegExp]> = [
  'erut',
  'patente',
  'no_quiebra',
  'estatutos',
  'vigencia',
].map(conSuPatron);

const PROPUESTA = /propuesta tecnica|oferta tecnica/;
const EXPERIENCIA = /experiencia/;

const masNuevo = <T extends { creado_en: string }>(xs: T[]): T | undefined =>
  [...xs].sort((a, b) => b.creado_en.localeCompare(a.creado_en))[0];

/** Qué va y qué falta, sin los respaldos (esos necesitan leer los Word:
 *  `conLosRespaldos`). */
export function armarElSet(d: DatosDelSet): ElSet {
  const piezas: PiezaDelSet[] = [];
  const faltan: string[] = [];
  const formularios = d.formularios.filter((f) => f.aplica);
  const cubiertos = new Set<FormularioDeLasBases>();
  const bases = d.archivos.filter((a) => a.seccion === 'bases');
  const postulacion = d.archivos.filter((a) => a.seccion === 'postulacion');

  // De cada archivo del comprador, solo la última corrida (de un PDF salen
  // varios Word en la misma); la propuesta, la más nueva.
  const generados = postulacion.filter((a) => a.origen === 'generado');
  const firmadoDe = (id: number) =>
    masNuevo(
      postulacion.filter((a) => a.origen === 'firmado' && a.viene_de === id),
    );
  const grupos = new Map<string, ArchivoDelSet[]>();
  for (const g of generados) {
    const clave = g.viene_de === null ? 'propuesta' : String(g.viene_de);
    grupos.set(clave, [...(grupos.get(clave) ?? []), g]);
  }
  for (const [clave, grupo] of grupos) {
    const ultimo = masNuevo(grupo) as ArchivoDelSet;
    const vigentes =
      clave === 'propuesta' || ultimo.generacion_id === null
        ? [ultimo]
        : grupo.filter((g) => g.generacion_id === ultimo.generacion_id);
    for (const g of vigentes) {
      const firmado = firmadoDe(g.id);
      const usado = firmado ?? g;
      const inicio = g.generacion_id ? d.inicioDe.get(g.generacion_id) : null;
      const viejo = Boolean(inicio && d.ofertaLista && inicio < d.ofertaLista);
      const avisos = [
        firmado ? null : 'sin firma',
        viejo ? 'se hizo antes de la última oferta' : null,
      ].filter((x): x is string => Boolean(x));
      if (!firmado) {
        faltan.push(
          `«${g.nombre}» va sin firma: usa «Firmar» si el formulario la pide.`,
        );
      }
      if (viejo) {
        faltan.push(
          `«${g.nombre}» se hizo antes de la última oferta: vuelve a generarlo.`,
        );
      }

      let carpetas: Carpeta[];
      if (clave === 'propuesta') {
        carpetas = ['tecnica'];
      } else {
        const delComprador = bases.find((b) => b.id === g.viene_de);
        const suyos = delComprador
          ? formularios.filter((f) =>
              mismoArchivo(f.archivo, delComprador.nombre),
            )
          : [];
        // Desde el 19-10 sale un Word por formulario (de un Word o de un
        // PDF del comprador): el suyo, por el nombre; si no se reconoce, se
        // le cree que trae todos. Un Word de antes, lleno entero, los trae
        // todos.
        const propios = suyos.filter((f) =>
          mismoFormulario(f.nombre, g.nombre),
        );
        const dePdf = /\.pdf$/i.test(delComprador?.nombre ?? '');
        const separado = dePdf || vigentes.length > 1;
        const cubre = separado && propios.length > 0 ? propios : suyos;
        cubre.forEach((f) => cubiertos.add(f));
        carpetas = sinRepetir(cubre.map((f) => carpetaDe(f.se_entrega_en)));
        if (carpetas.length === 0) carpetas = [carpetaPorNombre(g.nombre)];
      }
      piezas.push({
        nombre: usado.nombre,
        ruta: usado.ruta,
        bytes: usado.bytes,
        carpetas,
        que_es: clave === 'propuesta' ? 'propuesta' : 'formulario',
        aviso: avisos.length > 0 ? avisos.join(' · ') : null,
        texto: { ruta: g.ruta, nombre: g.nombre },
      });
    }
  }

  const pedidos = d.requisitos.map((r) => normalizar(r.que));
  const loPiden = (patron: RegExp) => pedidos.some((p) => patron.test(p));
  /** Ya va en la administrativa porque las bases lo piden ahí. */
  const enLaAdministrativa = (tipo: string, patron: RegExp) =>
    LO_QUE_PIDEN.some(([t]) => t === tipo) && loPiden(patron);
  /** Un documento general que no va en la administrativa: «4. Otros». */
  const generalNoPedido = (nombre: string) =>
    GENERALES.some(
      ([tipo, patron]) =>
        patron.test(normalizar(nombre)) && !enLaAdministrativa(tipo, patron),
    );

  // Lo subido a mano: todo (firmado, si se firmó aquí), en la carpeta de su
  // formulario si se reconoce.
  const subidos = postulacion.filter((a) => a.origen === 'subido');
  for (const s of subidos) {
    const suyos = formularios.filter((f) =>
      mismoFormulario(f.nombre, s.nombre),
    );
    suyos.forEach((f) => cubiertos.add(f));
    const carpetas = sinRepetir(suyos.map((f) => carpetaDe(f.se_entrega_en)));
    const usado = firmadoDe(s.id) ?? s;
    piezas.push({
      nombre: usado.nombre,
      ruta: usado.ruta,
      bytes: usado.bytes,
      carpetas:
        carpetas.length > 0
          ? carpetas
          : generalNoPedido(s.nombre)
            ? ['otros']
            : [carpetaPorNombre(s.nombre)],
      que_es: 'subido',
      aviso: null,
      texto: { ruta: s.ruta, nombre: s.nombre },
    });
  }

  for (const f of formularios) {
    if (cubiertos.has(f)) continue;
    faltan.push(
      f.archivo.trim()
        ? `Falta «${f.nombre}»: genéralo con «Generar anexos» o súbelo lleno a «Mi postulación».`
        : `Falta «${f.nombre}»: las bases no traen su formato; súbelo hecho a «Mi postulación».`,
    );
  }

  const enUnFormulario = (patron: RegExp) =>
    formularios.some((f) => patron.test(normalizar(f.nombre)));
  if (
    pedidos.some((p) => PROPUESTA.test(p)) &&
    !enUnFormulario(PROPUESTA) &&
    !piezas.some(
      (p) =>
        p.que_es === 'propuesta' ||
        (p.que_es === 'subido' && /propuesta/.test(normalizar(p.nombre))),
    )
  ) {
    faltan.push(
      'Falta la propuesta técnica: créala con «Crear propuesta técnica».',
    );
  }

  // De la carpeta de la empresa, lo que piden las bases y nada más.
  for (const [tipo, patron] of LO_QUE_PIDEN) {
    if (!loPiden(patron) || enUnFormulario(patron)) continue;
    if (subidos.some((s) => patron.test(normalizar(s.nombre)))) continue;
    const nombre = NOMBRES_DE_DOCUMENTO[tipo] ?? tipo;
    const doc = masNuevo(d.carpeta.filter((x) => x.tipo === tipo));
    if (!doc) {
      faltan.push(
        `Las bases piden «${nombre}» y no está en tu carpeta: súbelo en «Mi empresa».`,
      );
      continue;
    }
    const vencido = Boolean(doc.vence && doc.vence < d.corte);
    if (vencido) {
      faltan.push(
        `«${nombre}» venció el ${fechaCorta(doc.vence as string)}: súbelo renovado en «Mi empresa».`,
      );
    }
    piezas.push({
      nombre: doc.nombre,
      ruta: doc.ruta,
      bytes: doc.bytes,
      carpetas: ['administrativa'],
      que_es: 'documento',
      aviso: vencido ? `vencido el ${fechaCorta(doc.vence as string)}` : null,
    });
  }

  // Lo general para contratar que las bases no piden en otra parte, en
  // «4. Otros» (decisión 38). Lo que no está en la carpeta se dice una vez.
  const sinSubir: string[] = [];
  for (const [tipo, patron] of GENERALES) {
    if (enLaAdministrativa(tipo, patron) || enUnFormulario(patron)) continue;
    if (subidos.some((s) => patron.test(normalizar(s.nombre)))) continue;
    const nombre = NOMBRES_DE_DOCUMENTO[tipo] ?? tipo;
    const doc = masNuevo(d.carpeta.filter((x) => x.tipo === tipo));
    if (!doc) {
      sinSubir.push(`«${nombre}»`);
      continue;
    }
    const vencido = Boolean(doc.vence && doc.vence < d.corte);
    if (vencido) {
      faltan.push(
        `«${nombre}» venció el ${fechaCorta(doc.vence as string)}: súbelo renovado en «Mi empresa».`,
      );
    }
    piezas.push({
      nombre: doc.nombre,
      ruta: doc.ruta,
      bytes: doc.bytes,
      carpetas: ['otros'],
      que_es: 'documento',
      aviso: vencido ? `vencido el ${fechaCorta(doc.vence as string)}` : null,
    });
  }
  if (sinSubir.length > 0) {
    faltan.push(
      `Para contratar te pueden pedir ${sinSubir.join(', ')}: súbelos en «Mi empresa» y van en «4. Otros».`,
    );
  }

  return { piezas, faltan };
}

/** ¿Las bases piden experiencia? Entonces van sus respaldos. */
export const pidenExperiencia = (d: DatosDelSet): boolean =>
  [
    ...d.requisitos.map((r) => r.que),
    ...d.formularios.filter((f) => f.aplica).map((f) => f.nombre),
  ].some((t) => EXPERIENCIA.test(normalizar(t)));

const aparece = (numero: string, texto: string): boolean => {
  const n = numero.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return n !== '' && new RegExp(`(?<![\\w-])${n}(?![\\w-])`, 'i').test(texto);
};

/** Agrega los respaldos de la experiencia declarada: los de la carpeta
 *  cuyo número aparece en el texto de algún Word que va en el set (el
 *  anexo de experiencia los nombra por su número, sprint F). Van en la
 *  carpeta de ese Word (la técnica si va en varias), juntos. */
export function conLosRespaldos(
  set: ElSet,
  textos: Array<{ texto: string; carpetas: Carpeta[] }>,
  d: DatosDelSet,
): ElSet {
  const respaldos = d.carpeta.filter(
    (x) =>
      x.tipo === TIPO_RESPALDO && (x.datos as DatosDeRespaldo | null)?.numero,
  );
  const piezas = [...set.piezas];
  const faltan = [...set.faltan];
  let encontrados = 0;
  for (const r of respaldos) {
    const numero = (r.datos as DatosDeRespaldo).numero;
    const donde = textos.find((t) => aparece(numero, t.texto));
    if (!donde) continue;
    encontrados++;
    piezas.push({
      nombre: r.nombre,
      ruta: r.ruta,
      bytes: r.bytes,
      carpetas: [
        donde.carpetas.includes('tecnica') ? 'tecnica' : donde.carpetas[0],
      ],
      subcarpeta: 'Respaldos de experiencia',
      que_es: 'respaldo',
      aviso: null,
    });
  }
  if (pidenExperiencia(d) && encontrados === 0) {
    faltan.push(
      respaldos.length === 0
        ? 'Las bases piden experiencia: sube sus órdenes de compra o facturas como «Respaldo de experiencia» en «Mi empresa».'
        : 'Ningún anexo nombra tus respaldos de experiencia por su número: revisa el anexo de experiencia.',
    );
  }
  return { piezas, faltan };
}

/** Si un anexo dice que se adjunta la propuesta técnica en formato propio
 *  (la regla FORMATO_PROPIO, decisión 33), la propuesta tiene que ir: sin
 *  ella, el anexo de calidad queda remitiendo a nada. */
export function conLaPropuestaQueNombran(
  set: ElSet,
  textos: Array<{ texto: string }>,
): ElSet {
  const nombrada = textos.some((t) =>
    /propuesta tecnica en formato propio/.test(normalizar(t.texto)),
  );
  const hay = set.piezas.some(
    (p) =>
      p.que_es === 'propuesta' ||
      (p.que_es === 'subido' && /propuesta/.test(normalizar(p.nombre))),
  );
  if (!nombrada || hay) return set;
  return {
    ...set,
    faltan: [
      ...set.faltan,
      'Un anexo dice que se adjunta la propuesta técnica en formato propio, y la propuesta no está: vuelve a armar la postulación.',
    ],
  };
}

/** Dónde va cada pieza dentro del ZIP (una ruta por carpeta), sin nombres
 *  repetidos en una misma carpeta. */
export function rutasEnElZip(piezas: PiezaDelSet[]): string[][] {
  const usadas = new Set<string>();
  return piezas.map((p) =>
    p.carpetas.map((c) => {
      const base = [CARPETAS[c], p.subcarpeta].filter(Boolean).join('/');
      const nombre = p.nombre.replace(/[\\/]/g, '-');
      let ruta = `${base}/${nombre}`;
      for (let i = 2; usadas.has(ruta.toLowerCase()); i++) {
        ruta = `${base}/${sinExtension(nombre)} (${i})${nombre.slice(sinExtension(nombre).length)}`;
      }
      usadas.add(ruta.toLowerCase());
      return ruta;
    }),
  );
}
