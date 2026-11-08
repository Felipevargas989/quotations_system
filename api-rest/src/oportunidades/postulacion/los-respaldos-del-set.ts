import { type DatosDeRespaldo, TIPO_RESPALDO } from '../oferente/respaldo';
import {
  type Carpeta,
  type DatosDelSet,
  type ElSet,
  normalizar,
  type PiezaDelSet,
} from './el-set';

// LOS RESPALDOS DE LA EXPERIENCIA Y LA PROPUESTA QUE NOMBRAN LOS ANEXOS
// (decisión 34 del doc 17 y sprint F). Vivían en `el-set.ts`; se mudaron
// aquí el 08-11 (decisión 119, parte 3b) para que el set no pasara las 800
// líneas. Leen el texto de los Word que van en el set.

const EXPERIENCIA = /experiencia/;

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
 *  anexo de experiencia los nombra por su número, sprint F). Si ese anexo
 *  va firmado en PDF, los respaldos van DENTRO de su PDF, detrás (19-10:
 *  "un solo PDF"); si va en Word, aparte, juntos en la carpeta del Word
 *  (la técnica si va en varias). */
export function conLosRespaldos(
  set: ElSet,
  textos: Array<{ texto: string; carpetas: Carpeta[]; pieza?: PiezaDelSet }>,
  d: DatosDelSet,
): ElSet {
  // Los de la carpeta primero; de Post-venta, los que no estén ya.
  const vistos = new Set<string>();
  const respaldos = [
    ...d.carpeta
      .filter(
        (x) =>
          x.tipo === TIPO_RESPALDO &&
          (x.datos as DatosDeRespaldo | null)?.numero,
      )
      .map((x) => ({
        numero: (x.datos as DatosDeRespaldo).numero,
        nombre: x.nombre,
        ruta: x.ruta,
        bytes: x.bytes,
      })),
    ...(d.postVenta ?? []),
  ].filter((r) => {
    const clave = r.numero.replace(/\s+/g, '').toUpperCase();
    if (vistos.has(clave)) return false;
    vistos.add(clave);
    return true;
  });
  const piezas = [...set.piezas];
  const faltan = [...set.faltan];
  const adentro = new Map<PiezaDelSet, NonNullable<PiezaDelSet['adjuntos']>>();
  let encontrados = 0;
  for (const r of respaldos) {
    const numero = r.numero;
    const donde = textos.find((t) => aparece(numero, t.texto));
    if (!donde) continue;
    encontrados++;
    if (donde.pieza && /\.pdf$/i.test(donde.pieza.nombre)) {
      adentro.set(donde.pieza, [
        ...(adentro.get(donde.pieza) ?? []),
        { nombre: r.nombre, ruta: r.ruta, bytes: r.bytes },
      ]);
      continue;
    }
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
  for (const [i, p] of piezas.entries()) {
    const suyos = adentro.get(p);
    if (!suyos) continue;
    const nota = `con ${suyos.length === 1 ? 'su respaldo' : `sus ${suyos.length} respaldos`} adentro`;
    piezas[i] = {
      ...p,
      adjuntos: suyos,
      aviso: p.aviso ? `${p.aviso} · ${nota}` : nota,
    };
  }
  if (pidenExperiencia(d) && encontrados === 0) {
    faltan.push(
      respaldos.length === 0
        ? 'Las bases piden experiencia: sube sus órdenes de compra o facturas como «Respaldo de experiencia» en «Mi empresa», o a cada evento en Post-venta, y vuelve a armar la postulación.'
        : 'Ningún anexo nombra tus respaldos de experiencia por su número: revisa el anexo de experiencia.',
    );
  }
  return { piezas, faltan };
}

/** Si un anexo dice que se adjunta la propuesta técnica en formato propio
 *  (la regla de la decisión 33; desde la 40 el detalle va en el formulario,
 *  pero quedan anexos de antes), la propuesta tiene que ir: sin
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
