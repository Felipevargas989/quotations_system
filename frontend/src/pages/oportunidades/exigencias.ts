import { esUnPapel } from "@los-papeles";
import type { MarcaDeExigencia } from "../../services/exigencias.service";
import type { ResultadoDeBases } from "../../services/oportunidades.service";
import { normalizeText } from "../../utils/searchMatch";

// LAS EXIGENCIAS DE LA LICITACIÓN (19-10). Felipe: "un listado de
// exigencias, así como almuerzo, esto. Y marcar algunos que sean como lo
// tengo y otro hay que conseguir o revisar... y si marco uno que no puedo,
// bueno, desisto". Junta «¿Puedo cumplir?» (lo que la IA cruzó con tu
// carta, tus instalaciones y tu agenda) con las exigencias técnicas de las
// bases. Lo que es un documento no va aquí: va en el checklist.

/** Lo que dijo la IA de cada exigencia; null = no la cruzó. */
export type SugerenciaDeLaIA = "tengo" | "conseguir" | "no_se_puede" | null;

export interface Exigencia {
  /** La exigencia en minúsculas y sin tildes: con eso se guarda la marca
   *  (si se vuelve a analizar, la marca sigue con su exigencia). */
  clave: string;
  que: string;
  pagina: number | null;
  ia: SugerenciaDeLaIA;
  /** Con qué la tienes, o por qué no. */
  detalle: string | null;
}

/** La consulta de «Lo que Eventia sabe de tu empresa» (decisión 119,
 *  parte 3): la refrescan «Mi empresa» y las preguntas antes de armar. */
export const claveDeLoQueSabemos = ["oportunidades", "lo-que-sabemos"];

export const claveDeExigencia = (texto: string): string =>
  normalizeText(texto).replace(/\s+/g, " ").trim().slice(0, 400);

/** Un documento (formulario, certificado, copia…): va en el checklist.
 *  Desde la decisión 120 (08-11) también la cotización, la propuesta y las
 *  fotos aunque no digan «formulario» (`esUnPapel`, la misma regla del
 *  motor): no se marcan aquí ni se preguntan antes de armar. */
const ES_DOCUMENTO =
  /\b(formulario|anexo n|certificado|declaracion jurada|declaraciones juradas|copia de|patente|programa de integridad|boleta|garantia|f-?30|estatutos|escritura|curriculum)/;

export function exigenciasDe(
  r: Pick<ResultadoDeBases, "requisitos" | "cumplimiento">,
): Exigencia[] {
  const tecnicos = r.requisitos.filter((q) => q.tipo === "tecnico");
  const items = r.cumplimiento?.items ?? [];
  const todas =
    items.length > 0
      ? items.map((i) => ({
          que: i.que,
          // «¿Puedo cumplir?» numera las exigencias técnicas desde el 1.
          pagina: tecnicos[i.requisito - 1]?.pagina || null,
          ia: i.estado,
          detalle: i.con_que ? `Con: ${i.con_que}` : i.por_que || null,
        }))
      : tecnicos.map((q) => ({
          que: q.que,
          pagina: q.pagina || null,
          ia: null,
          detalle: null,
        }));
  return todas
    .filter(
      (e) => !ES_DOCUMENTO.test(normalizeText(e.que)) && !esUnPapel(e.que),
    )
    .map((e) => ({ ...e, clave: claveDeExigencia(e.que) }));
}

/** Cuántas marcó la empresa, de cada una. */
export const cuentaDeMarcas = (
  exigencias: Exigencia[],
  marcas: Record<string, MarcaDeExigencia>,
) => ({
  loTengo: exigencias.filter((e) => marcas[e.clave] === "lo_tengo").length,
  noPuedo: exigencias.filter((e) => marcas[e.clave] === "no_puedo"),
  sinMarcar: exigencias.filter((e) => !marcas[e.clave]).length,
});
