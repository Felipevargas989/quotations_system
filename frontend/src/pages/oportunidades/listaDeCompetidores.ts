import type {
  CompetidorReal,
  EtiquetaDeCompetidor,
  MarcaDeCompetidor,
} from "../../services/competencia.service";
import { formatCurrency } from "../../utils/currencies";
import { matchesSearch } from "../../utils/searchMatch";

// «TUS COMPETIDORES» (decisiones 70 y 71 del doc 17): los textos y filtros de
// la lista, sin pantalla, para probarlos solos. Desde el 23-10 sin «Parecido
// a ti»: solo los que compitieron contigo y los que sigues.

export type VistaDeCompetidores = "todos" | "seguido";

export const NOMBRE_DE_LA_ETIQUETA: Record<EtiquetaDeCompetidor, string> = {
  compitio: "Compitió contigo",
  seguido: "Lo sigues",
};

export const COLOR_DE_LA_ETIQUETA: Record<EtiquetaDeCompetidor, string> = {
  compitio: "bg-orange-50 text-orange-800",
  seguido: "bg-indigo-50 text-indigo-800",
};

export const NOMBRE_DE_LA_VISTA: Record<VistaDeCompetidores, string> = {
  todos: "Todos",
  seguido: "Los sigues",
};

/** Lo que se ve con la vista, el buscador y «No son competidores». */
export const deLaVista = (
  lista: readonly CompetidorReal[],
  vista: VistaDeCompetidores,
  verDescartados: boolean,
  busca: string,
): CompetidorReal[] =>
  lista.filter(
    (c) =>
      c.descartado === verDescartados &&
      (verDescartados || vista === "todos" || c.etiquetas.includes(vista)) &&
      matchesSearch(busca, c.nombre, c.rut),
  );

/** Cuántos hay en cada vista (sin los descartados) y cuántos descartados. */
export const conteos = (
  lista: readonly CompetidorReal[],
): Record<VistaDeCompetidores | "descartados", number> => {
  const vivos = lista.filter((c) => !c.descartado);
  return {
    todos: vivos.length,
    seguido: vivos.filter((c) => c.etiquetas.includes("seguido")).length,
    descartados: lista.length - vivos.length,
  };
};

const veces = (n: number) => `${n} ${n === 1 ? "vez" : "veces"}`;

/** «Se cruzaron 3 veces · ganó él 1 · ganaste tú 2». */
export const textoDeEncuentros = (
  c: Pick<CompetidorReal, "encuentros" | "te_gano" | "ganaste">,
): string =>
  `Se cruzaron ${veces(c.encuentros)} · ganó él ${c.te_gano} · ganaste tú ${c.ganaste}`;

/** «Su precio: 8 % más barato que el tuyo en 3 líneas», o por qué no se
 *  compara (ofertaron líneas distintas). null si no se cruzaron. */
export const textoDelPrecio = (
  diferencia: number | null,
  lineas: number,
): string | null => {
  if (diferencia === null) {
    return lineas === 0
      ? "Ofertaron líneas distintas: no se compara el precio"
      : null;
  }
  const n = Math.round(Math.abs(diferencia) * 10) / 10;
  const en = lineas > 1 ? ` en ${lineas} líneas` : "";
  if (n === 0) return `Su precio: igual al tuyo${en}`;
  const cifra = n.toLocaleString("es-CL", { maximumFractionDigits: 1 });
  return `Su precio: ${cifra} % ${diferencia < 0 ? "más barato" : "más caro"} que el tuyo${en}`;
};

/** «En tu zona: participó 12 veces, ganó 5 ($31.115.077) · más con DAEM
 *  Quillón». */
export const textoDeMercado = (c: CompetidorReal): string => {
  const ganado =
    c.ganadas > 0 && c.monto_ganado > 0
      ? ` (${formatCurrency(c.monto_ganado, "CLP")})`
      : "";
  const donde = c.comprador_principal
    ? ` · más con ${c.comprador_principal.nombre}`
    : "";
  return `En tu zona: participó ${veces(c.participaciones)}, ganó ${c.ganadas}${ganado}${donde}`;
};

/** La lista con lo que se acaba de marcar: «Lo sigues» entra o sale, y
 *  quien se queda sin razón para estar, sale. */
export const conMarca = (
  lista: readonly CompetidorReal[],
  marca: MarcaDeCompetidor,
): CompetidorReal[] =>
  lista.flatMap((c) => {
    if (c.rut !== marca.rut) return [c];
    const otras = c.etiquetas.filter((e) => e !== "seguido");
    const etiquetas: EtiquetaDeCompetidor[] = marca.seguido
      ? [...otras, "seguido"]
      : otras;
    if (etiquetas.length === 0) return [];
    return [
      {
        ...c,
        etiquetas,
        seguido: marca.seguido,
        descartado: marca.descartado,
      },
    ];
  });

/** «Actas leídas: 1.475 de 5.977» (o «todas al día»). */
export const textoDeLasActas = (a: {
  leidas: number;
  total: number;
  leyendo: boolean;
}): string => {
  const n = (x: number) => x.toLocaleString("es-CL");
  if (a.total === 0) return "Todavía no hay actas de tu zona.";
  if (a.leidas >= a.total) {
    return `Actas leídas: las ${n(a.total)} de tu zona, al día.`;
  }
  return `Actas leídas: ${n(a.leidas)} de ${n(a.total)} de tu zona${
    a.leyendo ? " · leyendo ahora" : " · se siguen leyendo solas cada noche"
  }.`;
};
