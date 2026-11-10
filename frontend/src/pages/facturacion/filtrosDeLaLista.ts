import type { SituacionEnLaLista } from "../../services/documentosTributarios.service";
import { hoyEnChile } from "../../utils/dates";

// LOS FILTROS DE LA LISTA DE FACTURACIÓN (§9.22). Viven en la página, no
// en la lista: al ir a anular o a emitir y volver, la lista se arma de
// nuevo y antes volvía al mes en curso (Felipe, 08-11, anulando la 377 y
// la 378 de octubre: *"el sistema me borra los filtros de fecha"*).

/** El mes de una fecha: del primero al último día (AAAA-MM-DD). */
const delMes = (hoy: string) => {
  const [a, m] = hoy.split("-").map(Number);
  const ultimo = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const mes = hoy.slice(0, 7);
  return {
    desde: `${mes}-01`,
    hasta: `${mes}-${String(ultimo).padStart(2, "0")}`,
  };
};

export type TipoDelFiltro = "todos" | "33" | "39" | "61" | "56";
export type EstadoDelFiltro = "todos" | Exclude<SituacionEnLaLista, "nota">;

export interface Filtros {
  q: string;
  tipo: TipoDelFiltro;
  estado: EstadoDelFiltro;
  desde: string;
  hasta: string;
}

/** Lo de fábrica: todo, del mes en curso. */
export const filtrosDeHoy = (): Filtros => ({
  q: "",
  tipo: "todos",
  estado: "todos",
  ...delMes(hoyEnChile()),
});
