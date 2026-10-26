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
