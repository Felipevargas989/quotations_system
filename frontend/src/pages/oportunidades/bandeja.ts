import { useEffect, useState } from "react";
import type { Oportunidad } from "../../services/oportunidades.service";
import {
  cuandoCierra,
  esPrioridad,
  filtrar,
  type Filtros,
  VISTAS,
} from "./oportunidades.utils";

// LA BANDEJA ORDENADA (Felipe, 18-10: "vamos con las 5", sobre el boceto
// del 17-10 con la bandeja vacía: "¿se podrá mejorar este front?"). Aparte
// de oportunidades.utils.ts, que está en el tope de 800 líneas del
// portero: lo nuevo va en su propio archivo.

/** Las pasadas del radar, en hora de Chile. Es COPIA del reloj del motor
 *  (`HORARIO_DEL_RADAR`, api-rest/src/oportunidades/oportunidades-cron.service.ts):
 *  una prueba lee ese archivo y compara, así que si el horario cambia allá
 *  y no acá, la prueba se pone roja antes de que la pantalla mienta. */
export const MINUTO_DEL_RADAR = 7;
export const HORAS_DEL_RADAR: readonly number[] = [2, 5, 9, 12, 15, 18, 23];

const dosCifras = (n: number) => String(n).padStart(2, "0");

/** «02:07»: la próxima pasada del radar, en hora de Chile, mire quien
 *  mire. Siempre cae dentro de las 5 horas siguientes, así que no hace
 *  falta decir el día. */
export const proximaPasada = (ahora: Date = new Date()): string => {
  const partes = new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(ahora);
  const valor = (tipo: string) =>
    Number(partes.find((p) => p.type === tipo)?.value ?? 0);
  const ya = valor("hour") * 60 + valor("minute");
  const hora =
    HORAS_DEL_RADAR.find((h) => h * 60 + MINUTO_DEL_RADAR > ya) ??
    HORAS_DEL_RADAR[0];
  return `${dosCifras(hora)}:${dosCifras(MINUTO_DEL_RADAR)}`;
};

/** La próxima pasada, al día: se vuelve a calcular cada minuto. */
export const useProximaPasada = (): string => {
  const [, setTic] = useState(0);
  useEffect(() => {
    const reloj = window.setInterval(() => setTic((n) => n + 1), 60_000);
    return () => window.clearInterval(reloj);
  }, []);
  return proximaPasada();
};

/** Lo guardado en la sesión puede traer una vista que ya no existe
 *  («Abiertas», «En estudio» o «Postuladas», hasta el 18-10): vuelve a
 *  «Por revisar». */
export const conVistaValida = (f: Filtros): Filtros =>
  VISTAS.some((v) => v.value === f.vista) ? f : { ...f, vista: "nueva" };

/** El número al lado de «Por revisar» y «Descartadas»: lo que se va a ver
 *  al pincharlo, con los demás filtros puestos (el semáforo incluido).
 *  Esos dos montones son de lo vigente, así que lo ya cerrado no cuenta
 *  (en «Historial» la lista trae también lo cerrado). */
export const contarPorVista = (
  lista: readonly Oportunidad[],
  f: Filtros,
  ahora: number = Date.now(),
): { nueva: number; descartada: number } => {
  const vigentes = lista.filter(
    (o) => !cuandoCierra(o.proceso.fecha_cierre, ahora).cerrada,
  );
  return {
    nueva: filtrar(vigentes, { ...f, vista: "nueva" }).length,
    descartada: filtrar(vigentes, { ...f, vista: "descartada" }).length,
  };
};

export type ClaveDeGrupo =
  | "prioridad"
  | "pronto"
  | "semana"
  | "despues"
  | "sin_cierre"
  | "cerradas";

export const TITULO_DEL_GRUPO: Record<ClaveDeGrupo, string> = {
  // Decisión 64: de tu rubro y de tu zona; el monto no cuenta.
  prioridad: "Prioridad: de tu rubro y de una comuna cercana",
  pronto: "Cierran en 3 días o menos",
  semana: "Esta semana",
  despues: "Más adelante",
  sin_cierre: "Sin cierre informado",
  cerradas: "Ya cerraron",
};

const HORA_MS = 3_600_000;

/** La lista en grupos, de arriba abajo: **Prioridad** (comuna cercana o
 *  alto valor; Felipe la pidió arriba el 17-10), lo que cierra en **3 días
 *  o menos** (la misma vara del rojo de la cuenta regresiva), **esta
 *  semana** (en 4 a 7 días), **más adelante**, lo que no informa cierre y,
 *  en «Historial», lo que **ya cerró**, lo más reciente primero. Dentro de
 *  cada grupo se respeta el orden que trae la lista (el motor la manda de
 *  lo que cierra antes a lo que cierra después). Sin grupos vacíos. */
export const agruparPorCierre = (
  lista: readonly Oportunidad[],
  ahora: number = Date.now(),
): Array<{ clave: ClaveDeGrupo; titulo: string; filas: Oportunidad[] }> => {
  const grupos: Record<ClaveDeGrupo, Oportunidad[]> = {
    prioridad: [],
    pronto: [],
    semana: [],
    despues: [],
    sin_cierre: [],
    cerradas: [],
  };
  for (const o of lista) {
    const t = o.proceso.fecha_cierre
      ? new Date(o.proceso.fecha_cierre).getTime()
      : NaN;
    if (Number.isNaN(t)) {
      grupos[esPrioridad(o) ? "prioridad" : "sin_cierre"].push(o);
      continue;
    }
    const horas = (t - ahora) / HORA_MS;
    if (horas <= 0) grupos.cerradas.push(o);
    else if (esPrioridad(o)) grupos.prioridad.push(o);
    else if (cuandoCierra(o.proceso.fecha_cierre, ahora).urgente)
      grupos.pronto.push(o);
    else if (Math.floor(horas / 24) <= 7) grupos.semana.push(o);
    else grupos.despues.push(o);
  }
  grupos.cerradas.sort(
    (a, b) =>
      new Date(b.proceso.fecha_cierre ?? 0).getTime() -
      new Date(a.proceso.fecha_cierre ?? 0).getTime(),
  );
  return (Object.keys(grupos) as ClaveDeGrupo[])
    .filter((clave) => grupos[clave].length > 0)
    .map((clave) => ({
      clave,
      titulo: TITULO_DEL_GRUPO[clave],
      filas: grupos[clave],
    }));
};

/** Qué decir cuando no queda nada a la vista:
 *  - `sin_datos`: el radar todavía no trae nada;
 *  - `al_dia`: en «Por revisar», sin filtros que achiquen, ya no queda
 *    nada nuevo (lo que vio Felipe el 17-10: «Verdes 0, Amarillas 0»);
 *  - `con_filtros`: algún filtro esconde lo que hay (tipo, región,
 *    buscador, o verdes o amarillas apagadas); se ofrece quitarlos;
 *  - `nada`: «Descartadas» o «Historial» vacíos.
 *  Encender las rojas no achica: no cuenta como filtro. */
export type BandejaVacia = "sin_datos" | "al_dia" | "con_filtros" | "nada";

export const hayFiltrosQueAchican = (f: Filtros): boolean =>
  Boolean(f.tipo || f.region || f.busca.trim()) ||
  !f.semaforos.includes("verde") ||
  !f.semaforos.includes("amarillo");

export const queDiceLaBandejaVacia = (
  total: number,
  f: Filtros,
): BandejaVacia => {
  if (total === 0) return "sin_datos";
  if (hayFiltrosQueAchican(f)) return "con_filtros";
  return f.vista === "nueva" ? "al_dia" : "nada";
};
