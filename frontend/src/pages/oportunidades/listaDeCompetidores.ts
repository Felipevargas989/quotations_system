import type {
  CompetidorReal,
  EtiquetaDeCompetidor,
  MarcaDeCompetidor,
} from "../../services/competencia.service";
import { formatCurrency } from "../../utils/currencies";
import { matchesSearch } from "../../utils/searchMatch";

// «TUS COMPETIDORES» (decisión 70 del doc 17, 22-10): los textos y filtros
// de la lista, sin pantalla, para probarlos solos.

export type VistaDeCompetidores = "todos" | EtiquetaDeCompetidor;

export const NOMBRE_DE_LA_ETIQUETA: Record<EtiquetaDeCompetidor, string> = {
  compitio: "Compitió contigo",
  similar: "Parecido a ti",
  seguido: "Lo sigues",
};

export const COLOR_DE_LA_ETIQUETA: Record<EtiquetaDeCompetidor, string> = {
  compitio: "bg-orange-50 text-orange-800",
  similar: "bg-sky-50 text-sky-800",
  seguido: "bg-indigo-50 text-indigo-800",
};

export const NOMBRE_DE_LA_VISTA: Record<VistaDeCompetidores, string> = {
  todos: "Todos",
  compitio: "Compitieron contigo",
  similar: "Parecidos a ti",
  seguido: "Los sigues",
};

/** Lo que se ve con la vista, el buscador y «Descartados». */
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
    compitio: vivos.filter((c) => c.etiquetas.includes("compitio")).length,
    similar: vivos.filter((c) => c.etiquetas.includes("similar")).length,
    seguido: vivos.filter((c) => c.etiquetas.includes("seguido")).length,
    descartados: lista.length - vivos.length,
  };
};

/** «Se cruzaron 3 veces · ganó él 1 · ganaste tú 2». */
export const textoDeEncuentros = (c: CompetidorReal): string =>
  `Se cruzaron ${c.encuentros} ${c.encuentros === 1 ? "vez" : "veces"} · ganó él ${c.te_gano} · ganaste tú ${c.ganaste}`;

/** «Su precio: 8 % más barato que el tuyo» (en promedio). */
export const textoDelPrecio = (diferencia: number | null): string | null => {
  if (diferencia === null) return null;
  const n = Math.round(Math.abs(diferencia) * 10) / 10;
  if (n === 0) return "Su precio: igual al tuyo";
  const cifra = n.toLocaleString("es-CL", { maximumFractionDigits: 1 });
  return `Su precio: ${cifra} % ${diferencia < 0 ? "más barato" : "más caro"} que el tuyo`;
};

/** «En tus compradores: 5 ofertas, ganó 2 ($12.300.000)». */
export const textoDeCompradores = (c: CompetidorReal): string =>
  `En tus compradores: ${c.en_tus_compradores} ${
    c.en_tus_compradores === 1 ? "oferta" : "ofertas"
  }, ganó ${c.triunfos_en_tus_compradores}${
    c.triunfos_en_tus_compradores > 0 && c.monto_ganado > 0
      ? ` (${formatCurrency(c.monto_ganado, "CLP")})`
      : ""
  }`;

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
