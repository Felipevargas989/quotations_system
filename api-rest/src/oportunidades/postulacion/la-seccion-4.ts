import type { Carpeta } from './el-set';

// LO QUE PIDE LA SECCIÓN 4 DEL ANÁLISIS, «LO QUE TIENES QUE PRESENTAR»
// (decisión 90 del doc 17, 27-10). Felipe: "el zip se debe armar en función
// de lo que piden las bases... con el análisis de las bases en la sección 4,
// lo que tienes que presentar", y "si las bases te dicen que el certificado
// de vigencia no puede ser mayor a 30 días, ese es el criterio". De aquí
// sale lo que el ZIP toma de «Mi empresa», y si manda el plazo de las bases
// o la fecha de vencimiento que anotó la empresa.

/** Un documento de la sección 4 del análisis (decisión 37). */
export type DocumentoDeLaSeccion4 = {
  nombre: string;
  parte?: string;
  cuando?: string;
  obligatorio?: boolean;
  condicion?: string;
  carpeta?: string;
};

/** Lo que las bases piden de «Mi empresa» y dónde va en el ZIP. */
export type PedidoDeLaCarpeta = {
  tipo: string;
  carpeta: Carpeta;
  condicion: string;
  /** Lo que falta se avisa solo si es obligatorio: lo demás lo ve la
   *  validación al leer el ZIP (como en la decisión 85). */
  obligatorio: boolean;
};

const normalizar = (t: string): string =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

/** ¿Las bases fijan un plazo desde la emisión («no mayor a 30 días»,
 *  «emitido hace menos de quince (15) días»)? Entonces la vigencia la fijan
 *  ellas y no la fecha de vencimiento que anotó la empresa. */
export const fijaUnPlazo = (condicion: string | undefined): boolean =>
  /\b(\d+|quince|treinta|sesenta|noventa)\)?\s*(\(\d+\)\s*)?(dias?|mes(es)?)\b/.test(
    normalizar(condicion ?? ''),
  );

/** Lo de UTP solo si se postula como Unión Temporal (en la 5040-14-LE26, la
 *  sección 4 pedía los estatutos «solo si postulas como UTP»), y el
 *  Registro de Proveedores se da por hecho: no van. */
const SOLO_SI_UTP = /\butp\b|uniones? temporal(es)? de proveedores/;
const ES_EL_REGISTRO = /registro (oficial )?de proveedores|chile ?proveedores/;

const CARPETA_DE_LA_PARTE: Readonly<Record<string, Carpeta>> = {
  administrativa: 'administrativa',
  tecnica: 'tecnica',
  economica: 'economica',
  otra: 'otros',
};

/** Lo que la sección 4 pide de «Mi empresa» con la oferta, en la parte que
 *  dice; null si el análisis no la trae (uno de antes). Los formularios y
 *  los respaldos de experiencia van por su lado, y los respaldos de la
 *  patente, con ella (decisión 61). */
export const pedidosDeLaSeccion4 = (
  documentos: DocumentoDeLaSeccion4[],
  tipoPorElNombre: (nombre: string) => string | null,
  tipoQueVaConLaPatente: string,
): PedidoDeLaCarpeta[] | null => {
  const seccion4 = documentos.filter((x) => x.cuando);
  if (seccion4.length === 0) return null;
  const pedidos: PedidoDeLaCarpeta[] = [];
  for (const x of seccion4) {
    if (x.cuando !== 'con_la_oferta') continue;
    const texto = normalizar(`${x.nombre} ${x.condicion ?? ''}`);
    if (SOLO_SI_UTP.test(texto) || ES_EL_REGISTRO.test(texto)) continue;
    const carpeta = x.carpeta ?? 'otro';
    if (carpeta === 'formulario' || carpeta === 'respaldo_experiencia') {
      continue;
    }
    // Lo que el análisis dejó en «otro», por su nombre.
    const tipo = carpeta === 'otro' ? tipoPorElNombre(x.nombre) : carpeta;
    if (!tipo || tipo === tipoQueVaConLaPatente) continue;
    if (pedidos.some((p) => p.tipo === tipo)) continue;
    pedidos.push({
      tipo,
      carpeta: CARPETA_DE_LA_PARTE[x.parte ?? ''] ?? 'administrativa',
      condicion: x.condicion ?? '',
      obligatorio: x.obligatorio !== false,
    });
  }
  return pedidos;
};
