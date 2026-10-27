import { extensionDe } from '../adjuntos/adjuntos.service';
import { CARPETAS, type PiezaDelSet } from '../postulacion/el-set';
import { esLeible, MAX_BYTES_DE_PDF, type NoLeido } from './comun';

// LO QUE LEE «VALIDAR TODO» (decisión 83 del doc 17, 26-10). Felipe:
// "validar todo debe validar todo lo que está en el ZIP contra las bases, o
// me equivoco?" y "armemos eso para que el validador sea nuestro seguro de
// que está todo en orden en la licitación". Antes leía solo «Mi
// postulación»; de «Mi empresa» veía el nombre y el vencimiento, y por eso
// no podía decir si el programa de integridad traía lo que piden. Ahora lee
// cada archivo del ZIP, con la carpeta donde va.

export type ArchivoParaValidar = {
  nombre: string;
  ruta: string;
  bytes: number;
  /** Dónde va en el ZIP: «2. Técnica», o dentro del PDF de un anexo. */
  donde: string;
  que_es: PiezaDelSet['que_es'];
  /** Cómo lo ve la IA: la carpeta y el nombre. */
  titulo: string;
  /** Lo de «Mi empresa» que no va en el ZIP pero se lee para ver si la
   *  empresa está habilitada (decisión 88). */
  fuera_del_zip?: true;
};

/** Primero lo que la empresa escribe y firma, después su carpeta y al
 *  final los respaldos: si el ZIP no cabe en un pedido, queda fuera lo de
 *  menos. */
const PRIORIDAD: Readonly<Record<PiezaDelSet['que_es'], number>> = {
  formulario: 0,
  propuesta: 0,
  subido: 0,
  documento: 1,
  respaldo: 2,
};

const dondeVa = (p: PiezaDelSet): string =>
  [p.carpetas.map((c) => CARPETAS[c]).join(' y '), p.subcarpeta]
    .filter(Boolean)
    .join(' / ');

/** Cada archivo del ZIP una vez y en su orden; los respaldos que van
 *  dentro del PDF de un anexo, justo después de él. */
export const loQueVaEnElZip = (piezas: PiezaDelSet[]): ArchivoParaValidar[] => {
  const archivos: ArchivoParaValidar[] = [];
  const vistos = new Set<string>();
  const sumar = (a: ArchivoParaValidar) => {
    if (vistos.has(a.ruta)) return;
    vistos.add(a.ruta);
    archivos.push(a);
  };
  for (const p of piezas) {
    const donde = dondeVa(p);
    sumar({
      nombre: p.nombre,
      ruta: p.ruta,
      bytes: p.bytes,
      donde,
      que_es: p.que_es,
      titulo: `${donde} / ${p.nombre}`,
    });
    for (const a of p.adjuntos ?? []) {
      sumar({
        nombre: a.nombre,
        ruta: a.ruta,
        bytes: a.bytes,
        donde: `${donde}, dentro de «${p.nombre}»`,
        que_es: 'respaldo',
        titulo: `${donde} / ${p.nombre} / respaldo: ${a.nombre}`,
      });
    }
  }
  return archivos;
};

// LO QUE HABILITA A LA EMPRESA (decisión 88 del doc 17, 27-10). Felipe:
// "el validador tiene que revisar todo... tiene que ser nuestro contralorito
// interno"; sus resoluciones sanitarias no le permiten un restaurante y la
// validación no lo vio, porque las bases no las piden y no iban en el ZIP.
// Ahora la IA las lee igual, para ver si la empresa puede hacer por ley lo
// que ofrece.

/** Los tipos de «Mi empresa» que dicen qué puede hacer la empresa por ley:
 *  de la patente y del inicio de actividades vale el más nuevo; de las
 *  resoluciones y de los respaldos de la patente, todos. */
const QUE_HABILITAN: Readonly<Record<string, 'todos' | 'el_mas_nuevo'>> = {
  resolucion_sanitaria: 'todos',
  patente: 'el_mas_nuevo',
  respaldo_patente: 'todos',
  inicio_actividades: 'el_mas_nuevo',
};

type DocumentoDeLaCarpeta = {
  tipo: string;
  nombre: string;
  ruta?: string;
  bytes?: number;
  creado_en?: string;
};

/** Lo de «Mi empresa» que habilita a la empresa y no va en el ZIP. */
export const loQueLaHabilita = (
  carpeta: DocumentoDeLaCarpeta[],
  enElZip: ArchivoParaValidar[],
): ArchivoParaValidar[] => {
  const enElSet = new Set(enElZip.map((a) => a.ruta));
  const vistos = new Set<string>();
  return [...carpeta]
    .sort((a, b) => (b.creado_en ?? '').localeCompare(a.creado_en ?? ''))
    .filter((d) => {
      const cuales = QUE_HABILITAN[d.tipo];
      // Sin archivo no hay nada que leer.
      if (!cuales || !d.ruta) return false;
      if (cuales === 'el_mas_nuevo') {
        if (vistos.has(d.tipo)) return false;
        vistos.add(d.tipo);
      }
      return !enElSet.has(d.ruta);
    })
    .map((d) => ({
      nombre: d.nombre,
      ruta: d.ruta ?? '',
      bytes: d.bytes ?? 0,
      donde: 'Mi empresa, no va en el ZIP',
      que_es: 'documento' as const,
      titulo: `Mi empresa, no va en el ZIP / ${d.nombre}`,
      fuera_del_zip: true as const,
    }));
};

/** Lo que la IA lee de una vez: lo legible y, en PDF, hasta el tope del
 *  pedido. Lo demás se avisa con su motivo y se revisa por su nombre. */
export const loQueCabe = (
  archivos: ArchivoParaValidar[],
): { leibles: ArchivoParaValidar[]; noLeidos: NoLeido[] } => {
  const fuera = new Map<ArchivoParaValidar, string>();
  let peso = 0;
  const porPrioridad = [...archivos].sort(
    (a, b) => PRIORIDAD[a.que_es] - PRIORIDAD[b.que_es],
  );
  for (const a of porPrioridad) {
    if (!esLeible(a.nombre)) {
      fuera.set(a, 'la IA lee PDF y Word: súbelo en PDF para que lo revise');
      continue;
    }
    if (extensionDe(a.nombre) !== 'pdf') continue;
    if (peso + a.bytes > MAX_BYTES_DE_PDF) {
      fuera.set(a, 'no cupo: los PDF del ZIP pasan de 22 MB juntos');
      continue;
    }
    peso += a.bytes;
  }
  return {
    leibles: archivos.filter((a) => !fuera.has(a)),
    noLeidos: archivos
      .filter((a) => fuera.has(a))
      .map((a) => ({ nombre: a.nombre, motivo: fuera.get(a) ?? '' })),
  };
};
