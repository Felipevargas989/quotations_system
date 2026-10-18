import type { CorridaDelRadar } from "../../services/oportunidades.service";

// «¿ESTÁ TODO?» (Felipe, 18-10: "¿cómo sé que está trayendo todas las
// licitaciones que me interesan?"). Con el resumen de la última pasada
// buena del radar: cuánto tiene Mercado Público, cuánto falta por traer y
// cuánto quedó sin leer; y un aviso si el radar lleva horas sin terminar
// bien una pasada. Aparte de oportunidades.utils.ts, que está en el tope
// de 800 líneas del portero.

const HORA_MS = 3_600_000;

/** Sin una pasada buena en tantas horas, algo anda mal: la pausa más
 *  larga entre dos pasadas es de 5 horas (de las 18:07 a las 23:07). */
export const HORAS_SIN_PASADA_PARA_AVISAR = 6;

export type Cobertura = {
  readonly tono: "al_dia" | "faltan" | "atrasado";
  readonly texto: string;
};

const miles = (n: number) => n.toLocaleString("es-CL");

const NO_PUDO: Record<string, string> = {
  caida: "Mercado Público no respondió",
  sin_cupo: "Mercado Público no dio más consultas por hoy",
  sin_ticket: "falta el ticket de Mercado Público",
};

export const coberturaDe = (
  ultimaBuena: CorridaDelRadar | undefined,
  ahora: number = Date.now(),
): Cobertura | null => {
  if (!ultimaBuena) return null;

  const termino = new Date(
    ultimaBuena.termino_en ?? ultimaBuena.empezo_en,
  ).getTime();
  const horas = Math.floor((ahora - termino) / HORA_MS);
  if (horas >= HORAS_SIN_PASADA_PARA_AVISAR) {
    return {
      tono: "atrasado",
      texto: `El radar no termina bien una pasada desde hace ${horas} h`,
    };
  }

  const r = ultimaBuena.resumen;
  const lic = r?.licitaciones;
  const compras = r?.compras_agiles;
  const fallaLic = lic?.estado ? NO_PUDO[lic.estado] : undefined;
  const fallaCompras = compras?.estado ? NO_PUDO[compras.estado] : undefined;
  if (fallaLic || fallaCompras) {
    return {
      tono: "atrasado",
      texto: `La última pasada no trajo ${
        fallaLic ? "las licitaciones" : "las compras ágiles"
      }: ${fallaLic ?? fallaCompras}`,
    };
  }

  // Lo que no alcanzó a pedirse, y lo que se pidió y Mercado Público no
  // entregó: las dos cosas se vuelven a pedir en la próxima pasada.
  const faltanLic = (lic?.pendientes ?? 0) + (lic?.sin_detalle ?? 0);
  const faltanCompras = compras?.pendientes ?? 0;
  const sinLeer = r?.lectura?.sin_leer ?? 0;
  const faltan = [
    faltanLic > 0 &&
      `faltan ${miles(faltanLic)} de ${miles(lic?.activas ?? 0)} licitaciones de Chile`,
    faltanCompras > 0 && `faltan ${miles(faltanCompras)} compras ágiles`,
    sinLeer > 0 && `${miles(sinLeer)} sin leer`,
  ].filter(Boolean) as string[];
  if (faltan.length > 0) {
    const texto = faltan.join(" · ");
    return {
      tono: "faltan",
      texto: `${texto.charAt(0).toUpperCase()}${texto.slice(1)}: entran en las próximas pasadas`,
    };
  }

  return {
    tono: "al_dia",
    texto: `Al día: ${miles(lic?.activas ?? 0)} licitaciones de Chile y ${miles(
      compras?.listadas ?? 0,
    )} compras ágiles de tus regiones`,
  };
};
