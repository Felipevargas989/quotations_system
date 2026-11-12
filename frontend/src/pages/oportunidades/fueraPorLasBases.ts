import type { Oportunidad } from "../../services/oportunidades.service";

// «NO ES PARA TI» (decisión 129, sprint 2): las bases, leídas solas después
// de cada pasada del radar, piden el servicio en otro lugar (decisión 117).
// Sale de «Por revisar» a su montón, con su porqué. Aparte de
// oportunidades.utils.ts, que está cerca del tope de 800 líneas del portero,
// y con otro nombre que `NoEsParaTi.tsx` (la franja burdeo de la ficha): en
// un disco que no distingue mayúsculas, los dos se confundían.

export const noEsParaTi = (
  o: Pick<Oportunidad, "segun_las_bases" | "se_hace_en_el_complejo">,
): boolean => Boolean(o.segun_las_bases) && o.se_hace_en_el_complejo === "no";
