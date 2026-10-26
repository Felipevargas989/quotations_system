import type { MarcaDeExigencia } from "../../services/exigencias.service";
import type {
  ArmadoDeLaOferta,
  FilaDeLaOferta,
} from "../../services/postulacion.service";
import { normalizeText } from "../../utils/searchMatch";
import {
  esOpcional,
  type FilaDelChecklist,
  resumenDelChecklist,
} from "./checklistDeDocumentos";
import type { Exigencia } from "./exigencias";
import { numeroDelFormulario } from "./notasDeLaPostulacion";

// «BASES Y CRITERIOS» RELACIONADO (decisión 80 del doc 17, 26-10). Felipe:
// "¿cómo podemos ordenar esto? para que estén relacionados y sirva al
// propósito". Cuatro bloques que se responden entre sí: cómo te evalúan
// (con cómo vas en cada criterio), lo que te deja fuera (con su estado), lo
// que tienes que ofrecer (cada exigencia con UN solo estado y cómo la
// ofreces) y lo que tienes que presentar. Aquí, las piezas sin red que los
// cruzan.

/** Un sello: el texto corto y su color. */
export interface Sello {
  texto: string;
  tono: "bien" | "ojo" | "mal" | "neutro";
}

export const CLASES_DEL_TONO: Record<Sello["tono"], string> = {
  bien: "bg-green-100 text-green-800",
  ojo: "bg-amber-100 text-amber-800",
  mal: "bg-red-100 text-red-800",
  neutro: "bg-gray-100 text-gray-600",
};

const normalizar = (t: string) =>
  normalizeText(t)
    .replace(/[^a-z0-9ñ]+/g, " ")
    .trim();

// Las que no distinguen una exigencia de otra.
const VACIAS = new Set([
  "para",
  "como",
  "cada",
  "desde",
  "hasta",
  "entre",
  "sobre",
  "todo",
  "toda",
  "todos",
  "todas",
  "este",
  "esta",
  "estos",
  "estas",
  "debe",
  "deben",
  "persona",
  "personas",
  "minimo",
  "maximo",
  "linea",
]);

const palabras = (t: string) =>
  new Set(
    normalizar(t)
      .split(" ")
      .filter((p) => p.length >= 4 && !/^\d+$/.test(p) && !VACIAS.has(p)),
  );

/** Qué parte de lo más corto está en lo otro (0 a 1). */
const parecido = (a: Set<string>, b: Set<string>) => {
  if (a.size === 0 || b.size === 0) return 0;
  let comunes = 0;
  for (const p of a) if (b.has(p)) comunes += 1;
  return comunes / Math.min(a.size, b.size);
};

const UMBRAL = 0.5;

/** Cada exigencia con la línea de la oferta que la cubre: la oferta y el
 *  análisis leen las mismas bases punto por punto, así que se juntan por
 *  las palabras que comparten (y la página, si es la misma). Una línea de
 *  la oferta va a una sola exigencia. */
export function ofertaDeCadaExigencia(
  exigencias: Exigencia[],
  matriz: FilaDeLaOferta[],
): Map<string, FilaDeLaOferta> {
  const deLasExigencias = exigencias.map((e) => palabras(e.que));
  const deLaOferta = matriz.map((m) => palabras(m.especificacion));
  const pares: Array<{ e: number; m: number; nota: number }> = [];
  exigencias.forEach((e, i) =>
    matriz.forEach((m, j) => {
      const nota =
        parecido(deLasExigencias[i], deLaOferta[j]) +
        (e.pagina && m.pagina === e.pagina ? 0.15 : 0);
      if (nota >= UMBRAL) pares.push({ e: i, m: j, nota });
    }),
  );
  pares.sort((x, y) => y.nota - x.nota);
  const usadas = new Set<number>();
  const cubre = new Map<string, FilaDeLaOferta>();
  for (const p of pares) {
    const clave = exigencias[p.e].clave;
    if (cubre.has(clave) || usadas.has(p.m)) continue;
    cubre.set(clave, matriz[p.m]);
    usadas.add(p.m);
  }
  return cubre;
}

/** El pedido al proveedor: todo lo que la empresa no tiene, en una sola
 *  lista (Felipe, 26-10: "deja uno solo y mete todo ahí"). Una oferta
 *  armada antes de ese día puede traer aparte lo que faltaba en el
 *  catálogo: se suma aquí, sin repetir. */
export const pedidoAlProveedor = (
  oferta: Pick<
    ArmadoDeLaOferta,
    "subcontratar" | "faltan_en_el_catalogo"
  > | null,
): string[] => [
  ...new Set(
    [
      ...(oferta?.subcontratar ?? []),
      ...(oferta?.faltan_en_el_catalogo ?? []).map((f) => f.que),
    ]
      .map((x) => x.trim())
      .filter(Boolean),
  ),
];

/** Lo que dice el «cómo» de una línea de la oferta: si es solo un dato
 *  por completar, ese dato; si lo trae entre medio, marcado. */
export const textoDeLaOferta = (como: string): string => {
  const solo = /^\s*\[COMPLETAR:\s*([^\]]+)\]\s*$/i.exec(como);
  return solo
    ? solo[1].trim()
    : como.replace(/\[COMPLETAR:\s*([^\]]+)\]/gi, "[por definir: $1]");
};

export type EstadoDeExigencia =
  | "lo_tienes"
  | "no_puedes"
  | "catalogo"
  | "subcontratar"
  | "por_definir"
  | "no_va"
  | "ia_lo_tienes"
  | "ia_conseguir"
  | "ia_no_se_puede"
  | "por_revisar";

export const ESTADOS_DE_EXIGENCIA: Record<EstadoDeExigencia, Sello> = {
  lo_tienes: { texto: "lo tienes", tono: "bien" },
  no_puedes: { texto: "no puedes", tono: "mal" },
  catalogo: { texto: "de tu catálogo", tono: "bien" },
  subcontratar: { texto: "subcontratar", tono: "ojo" },
  por_definir: { texto: "por definir", tono: "ojo" },
  no_va: { texto: "no va", tono: "neutro" },
  ia_lo_tienes: { texto: "IA: lo tienes", tono: "bien" },
  ia_conseguir: { texto: "IA: conseguir", tono: "ojo" },
  ia_no_se_puede: { texto: "IA: no se puede", tono: "mal" },
  por_revisar: { texto: "por revisar", tono: "neutro" },
};

// Lo que no se ofrece (la línea que no se postula) lo dice la IA en su
// «cómo» al armar la oferta.
const NO_SE_OFRECE =
  /no forma parte de la oferta|no se oferta|no se ofrece|postula solo|no postula/;

/** UN solo estado por exigencia (Felipe, 26-10: el análisis decía
 *  «conseguir» los baños y la oferta, «catálogo»). Manda lo que marcaste;
 *  después, cómo se ofreció al armar la postulación; al final, la primera
 *  lectura de la IA. */
export function estadoDeExigencia(
  e: Pick<Exigencia, "ia">,
  marca: MarcaDeExigencia | undefined,
  fila: FilaDeLaOferta | undefined,
): EstadoDeExigencia {
  if (marca === "lo_tengo") return "lo_tienes";
  if (marca === "no_puedo") return "no_puedes";
  if (fila) {
    if (fila.origen === "catalogo") return "catalogo";
    if (fila.origen === "subcontratar") return "subcontratar";
    return NO_SE_OFRECE.test(normalizar(fila.como)) ? "no_va" : "por_definir";
  }
  if (e.ia === "tengo") return "ia_lo_tienes";
  if (e.ia === "conseguir") return "ia_conseguir";
  if (e.ia === "no_se_puede") return "ia_no_se_puede";
  return "por_revisar";
}

const cuantas = (estados: EstadoDeExigencia[], ...de: EstadoDeExigencia[]) =>
  estados.filter((x) => de.includes(x)).length;

/** «12 exigencias: 9 de tu catálogo · 1 por subcontratar · 2 no van». */
export function resumenDeLasExigencias(estados: EstadoDeExigencia[]): string {
  // [cuántas, en singular, en plural]
  const partes: Array<[number, string, string]> = [
    [
      cuantas(estados, "no_puedes", "ia_no_se_puede"),
      "que no puedes",
      "que no puedes",
    ],
    [cuantas(estados, "por_definir"), "por definir", "por definir"],
    [cuantas(estados, "ia_conseguir"), "por conseguir", "por conseguir"],
    [cuantas(estados, "subcontratar"), "por subcontratar", "por subcontratar"],
    [cuantas(estados, "lo_tienes", "ia_lo_tienes"), "la tienes", "las tienes"],
    [cuantas(estados, "catalogo"), "de tu catálogo", "de tu catálogo"],
    [cuantas(estados, "por_revisar"), "por revisar", "por revisar"],
    [cuantas(estados, "no_va"), "no va", "no van"],
  ];
  const total = estados.length;
  return `${total} ${total === 1 ? "exigencia" : "exigencias"}: ${partes
    .filter(([n]) => n > 0)
    .map(([n, una, varias]) => `${n} ${n === 1 ? una : varias}`)
    .join(" · ")}`;
}

/** Lo que más importa de las exigencias, en un sello: lo que no puedes, lo
 *  que falta conseguir o definir, lo que se subcontrata, o todo cubierto. */
export function selloDeLasExigencias(
  estados: EstadoDeExigencia[],
): Sello | null {
  if (estados.length === 0) return null;
  const no = cuantas(estados, "no_puedes", "ia_no_se_puede");
  if (no > 0) return { tono: "mal", texto: `${no} que no puedes` };
  const conseguir = cuantas(estados, "por_definir", "ia_conseguir");
  if (conseguir > 0)
    return { tono: "ojo", texto: `${conseguir} por conseguir` };
  const revisar = cuantas(estados, "por_revisar");
  if (revisar > 0) return { tono: "ojo", texto: `${revisar} por revisar` };
  const sub = cuantas(estados, "subcontratar");
  if (sub > 0) return { tono: "ojo", texto: `${sub} por subcontratar` };
  return { tono: "bien", texto: "todo cubierto" };
}

/** La experiencia confirmada frente a lo que dan el puntaje máximo. */
export function selloDeLaExperiencia(
  e: {
    piden: boolean;
    confirmada: boolean;
    contratos: number;
    pide: number;
  } | null,
): Sello | null {
  if (!e?.piden) return null;
  if (!e.confirmada) return { tono: "ojo", texto: "por confirmar" };
  const contratos =
    e.contratos === 1 ? "1 contrato" : `${e.contratos} contratos`;
  if (e.pide <= 0) return { tono: "bien", texto: contratos };
  return e.contratos >= e.pide
    ? { tono: "bien", texto: `${contratos}: puntaje máximo` }
    : { tono: "ojo", texto: `${contratos} de ${e.pide} para el máximo` };
}

/** Los documentos para postular: cuántos están listos. */
export function selloDeLosDocumentos(filas: FilaDelChecklist[]): Sello | null {
  const { listos, faltan, total } = resumenDelChecklist(filas);
  if (total === 0) return null;
  return {
    tono: faltan > 0 ? "mal" : listos < total ? "ojo" : "bien",
    texto:
      listos === total ? "documentos listos" : `${listos} de ${total} listos`,
  };
}

/** El programa de integridad y lo que lo acompaña. */
export function selloDeLaIntegridad(filas: FilaDelChecklist[]): Sello | null {
  const suyas = filas.filter(
    (f) =>
      !esOpcional(f) &&
      f.estado !== "no_aplica" &&
      /integridad|probidad|etica/.test(normalizar(f.nombre)),
  );
  if (suyas.length === 0) return null;
  const faltan = suyas.filter(
    (f) => f.estado === "falta" || f.estado === "vencido",
  ).length;
  if (faltan === 0) return { tono: "bien", texto: "lo tienes" };
  return {
    tono: "mal",
    texto:
      faltan === suyas.length ? "falta" : `falta ${faltan} de ${suyas.length}`,
  };
}

export interface ComoVas {
  precio: Sello | null;
  experiencia: Sello | null;
  exigencias: Sello | null;
  documentos: Sello | null;
  integridad: Sello | null;
}

/** Cómo vas en un criterio de evaluación, por su nombre; null si no se
 *  sabe qué lo mide. */
export function comoVasEn(criterio: string, c: ComoVas): Sello | null {
  const n = normalizar(criterio);
  if (/integridad|etica|probidad/.test(n)) return c.integridad;
  if (/econom|precio/.test(n)) return c.precio;
  if (/experiencia/.test(n)) return c.experiencia;
  // Lo técnico antes: «requisitos técnicos» es lo que se ofrece; los
  // demás requisitos («Cumplimiento de requisitos», «formales») son los
  // documentos.
  if (/calidad|tecnic|propuesta/.test(n)) return c.exigencias;
  if (/formal|administrativ|documento|requisito/.test(n)) {
    return c.documentos;
  }
  return null;
}

/** Los N° de formulario que nombra un texto: «Formularios N°3, N°4 o N°5»
 *  → 3, 4 y 5. «Línea N°1» no es un formulario. */
export function numerosDeFormularios(texto: string): number[] {
  if (!/formulario|anexo/i.test(texto)) return [];
  const numeros = new Set<number>();
  for (const m of texto.matchAll(/(l[ií]nea\s*)?\bn\s*[°º.]\s*(\d{1,2})\b/gi)) {
    if (!m[1]) numeros.add(Number(m[2]));
  }
  for (const m of texto.matchAll(
    /\b(?:formularios?|anexos?)\s+(\d{1,2})\b/gi,
  )) {
    numeros.add(Number(m[1]));
  }
  return [...numeros];
}

const TEXTO_DEL_DOCUMENTO: Record<FilaDelChecklist["estado"], string> = {
  firmado: "firmado",
  en_tu_carpeta: "en tu carpeta",
  en_tu_postulacion: "en tu postulación",
  hecho: "falta firmar",
  lo_arma_la_ia: "lo arma la IA",
  vencido: "vencido",
  falta: "falta",
  no_aplica: "no aplica",
};

/** «N°3 y N°5», o nada si no son formularios. */
const cuales = (filas: FilaDelChecklist[]) => {
  const numeros = filas.map((f) => numeroDelFormulario(f.nombre));
  if (numeros.some((n) => n === null)) return "";
  const nombres = numeros.map((n) => `N°${n}`);
  return `${nombres.length > 1 ? `${nombres.slice(0, -1).join(", ")} y ` : ""}${nombres[nombres.length - 1]} `;
};

/** El estado de unos documentos en un sello: lo peor manda. */
function selloDeLasFilas(filas: FilaDelChecklist[]): Sello {
  const con = (...estados: FilaDelChecklist["estado"][]) =>
    filas.filter((f) => estados.includes(f.estado));
  const faltan = con("falta", "vencido");
  if (faltan.length > 0) {
    return {
      tono: "mal",
      texto: `${cuales(faltan)}${faltan.every((f) => f.estado === "vencido") ? "vencido" : faltan.length > 1 ? "faltan" : "falta"}`,
    };
  }
  for (const estado of ["hecho", "lo_arma_la_ia"] as const) {
    const suyas = con(estado);
    if (suyas.length > 0) {
      return {
        tono: "ojo",
        texto: `${cuales(suyas)}${TEXTO_DEL_DOCUMENTO[estado]}`,
      };
    }
  }
  if (filas.every((f) => f.estado === "no_aplica")) {
    return { tono: "neutro", texto: "no aplica" };
  }
  return {
    tono: "bien",
    texto: filas.length === 1 ? TEXTO_DEL_DOCUMENTO[filas[0].estado] : "listos",
  };
}

/** El estado de una causa de quedar fuera: los formularios que nombra, el
 *  precio frente al presupuesto, las exigencias o el documento del que
 *  habla. null si no se sabe. */
export function estadoDeLoQueTeDejaFuera(
  texto: string,
  c: {
    filas: FilaDelChecklist[];
    precio: Sello | null;
    exigencias: Sello | null;
  },
): Sello | null {
  const numeros = numerosDeFormularios(texto);
  if (numeros.length > 0) {
    const suyas = c.filas.filter((f) => {
      const n = numeroDelFormulario(f.nombre);
      return n !== null && numeros.includes(n);
    });
    if (suyas.length > 0) return selloDeLasFilas(suyas);
  }
  const n = normalizar(texto);
  // «Ofertar más de $12.000.000 con IVA», «el monto disponible de la
  // línea», «las ofertas que superen el presupuesto».
  if (
    /presupuesto|monto disponible|monto maximo|precio|ofertar mas|ofrecer mas|superen?\b|sobrepas/.test(
      n,
    )
  ) {
    return c.precio
      ? {
          tono: c.precio.tono,
          texto: c.precio.tono === "bien" ? "calza" : "se pasa",
        }
      : null;
  }
  if (/\b100\b|totalidad|servicios|bases tecnicas|especificaciones/.test(n)) {
    return c.exigencias;
  }
  const delTexto = palabras(texto);
  const documento = c.filas.find((f) => {
    const suyas = palabras(f.nombre);
    return suyas.size > 0 && parecido(suyas, delTexto) >= 0.75;
  });
  return documento ? selloDeLasFilas([documento]) : null;
}
