import type { Oportunidad } from "../../services/oportunidades.service";
import { noEsParaTi } from "./fueraPorLasBases";

// LOS MONTONES DE LA BANDEJA, como botones con su número (18-10). Abre en
// "nueva" = Por revisar: lo que todavía nadie decidió (Felipe, 17-10: "que
// las que pincho me interesa ya no aparezcan acá... solo queda lo nuevo a
// revisar"). Lo en estudio y lo postulado vive en «Mis licitaciones», no
// acá: tenerlo en los dos lados confunde. "historial" trae todo, también lo
// ya cerrado. Desde la decisión 129, lo que las bases dejan fuera sale de
// «Por revisar» a «No es para ti» (`noEsParaTi`).
//
// Y DESDE LA DECISIÓN 131 (12-11), EL RECICLAJE TAMBIÉN SALE. Felipe: "lo
// que quiero ver en bandeja de entrada es el descreme", "eliminando las que
// son muy chicas porque no me interesan, eliminando las que no son lo mío".
// El rojo de tu zona y de tu rubro (decisión 72) pasa a su montón,
// «Reciclaje»; en «Por revisar» quedan las verdes, las amarillas y lo sin
// leer. Al buscar en «Por revisar» aparece también el reciclaje, para que
// nada guardado se pierda. Aparte de oportunidades.utils.ts, que está cerca
// del tope de 800 líneas del portero.

export type Vista =
  | "nueva"
  | "no_es_para_ti"
  | "reciclaje"
  | "descartada"
  | "seguida"
  | "historial";

export const VISTAS: ReadonlyArray<{
  value: Vista;
  label: string;
  ayuda: string;
}> = [
  {
    value: "nueva",
    label: "Por revisar",
    ayuda: "Lo nuevo que nadie ha decidido: verdes y amarillas",
  },
  {
    value: "no_es_para_ti",
    label: "No es para ti",
    ayuda: "Las bases te dejan fuera: piden el servicio en otro lugar",
  },
  {
    value: "reciclaje",
    label: "Reciclaje",
    ayuda: "La IA dice que no, pero es de tu zona y de tu rubro",
  },
  {
    value: "descartada",
    label: "Descartadas",
    ayuda: "Lo que descartaste: no se borra y se puede recuperar",
  },
  {
    value: "seguida",
    label: "En seguimiento",
    ayuda: "Las que sigues sin postular: el radar revisa cada día quién gana",
  },
  {
    value: "historial",
    label: "Historial",
    ayuda: "Todo, también lo que ya cerró",
  },
];

/** El rojo de tu zona y de tu rubro (decisión 72): la IA dice que no, pero
 *  lleva el aviso de comuna cercana. El resto del rojo es la basura. */
export const esReciclaje = (
  o: Pick<Oportunidad, "semaforo" | "alertas">,
): boolean => o.semaforo === "rojo" && o.alertas.includes("comuna_cercana");

/** En qué montón cae cada una. Las nuevas se reparten: lo que las bases
 *  dejan fuera va a «No es para ti»; el reciclaje, a «Reciclaje» (y a
 *  «Por revisar» solo al buscar); el resto, a «Por revisar». */
export const pasaLaVista = (
  o: Oportunidad,
  vista: Vista,
  busca = "",
): boolean => {
  if (vista === "historial") return true;
  if (o.estado !== "nueva") return o.estado === vista;
  if (noEsParaTi(o)) return vista === "no_es_para_ti";
  if (esReciclaje(o)) {
    return vista === "reciclaje" || (vista === "nueva" && busca.trim() !== "");
  }
  return vista === "nueva";
};

/** Los montones que se ven enteros, sin el semáforo: lo que tienen quedó
 *  rojo (decisiones 129 y 131) o se sigue (decisión 30). Al buscar en «Por
 *  revisar», también. */
export const seVeEntera = (vista: Vista, busca = ""): boolean =>
  vista === "no_es_para_ti" ||
  vista === "reciclaje" ||
  vista === "seguida" ||
  (vista === "nueva" && busca.trim() !== "");
