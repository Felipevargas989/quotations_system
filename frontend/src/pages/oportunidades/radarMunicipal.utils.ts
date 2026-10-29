import type {
  ProveedorDeUnaSenal,
  SenalesDelMunicipio,
} from "../../services/radarMunicipal.service";
import { urlMercadoPublico } from "./oportunidades.utils";

// EL RADAR MUNICIPAL (decisión 108, solo en el laboratorio): cómo se lee
// cada número y cada señal. Las señales vienen del informe «Detección de
// anomalías en compras públicas» que trajo Felipe el 28-10; el cálculo
// vive en la base (migración 171). Una señal no es una acusación: dice
// dónde mirar.

const SIN_DATOS = "sin datos";

/** «$2.371 M»: los montos grandes, en millones. */
export const millones = (n: number | null | undefined): string => {
  if (n === null || n === undefined) return SIN_DATOS;
  if (Math.abs(n) < 1_000_000) return "$" + Math.round(n).toLocaleString("es-CL");
  const enMillones = n / 1_000_000;
  return `$${enMillones.toLocaleString("es-CL", {
    maximumFractionDigits: Math.abs(enMillones) >= 100 ? 0 : 1,
  })} M`;
};

/** «$1.234», sin decimales. */
export const pesos = (n: number | null | undefined): string =>
  n === null || n === undefined
    ? SIN_DATOS
    : "$" + Math.round(n).toLocaleString("es-CL");

/** «37 %». */
export const porcentaje = (x: number | null | undefined): string =>
  x === null || x === undefined ? SIN_DATOS : `${Math.round(x * 100)} %`;

export const MESES = [
  "Ene",
  "Feb",
  "Mar",
  "Abr",
  "May",
  "Jun",
  "Jul",
  "Ago",
  "Sep",
  "Oct",
  "Nov",
  "Dic",
] as const;

const NOMBRES_DE_MES = [
  "enero",
  "febrero",
  "marzo",
  "abril",
  "mayo",
  "junio",
  "julio",
  "agosto",
  "septiembre",
  "octubre",
  "noviembre",
  "diciembre",
];

/** «noviembre 2025 a octubre 2026», de la ventana de las señales. */
export const ventanaEnPalabras = (
  desde: string | null | undefined,
  hasta: string | null | undefined,
): string => {
  const mes = (f: string) => {
    const [a, m] = f.split("-").map(Number);
    return `${NOMBRES_DE_MES[m - 1]} ${a}`;
  };
  return desde && hasta ? `${mes(desde)} a ${mes(hasta)}` : "";
};

/** La ficha de una orden de compra en Mercado Público. */
export const urlOrdenDeCompra = (codigo: string): string =>
  `https://www.mercadopublico.cl/PurchaseOrder/Modules/PO/DetailsPurchaseOrder.aspx?codigoOC=${encodeURIComponent(codigo)}`;

/** Los ejemplos de una señal: licitaciones con su enlace, o proveedores. */
export type EjemplosDeSenal =
  | { tipo: "licitaciones"; codigos: string[] }
  | { tipo: "proveedores"; proveedores: ProveedorDeUnaSenal[] };

export interface Senal {
  clave: keyof SenalesDelMunicipio;
  titulo: string;
  /** Qué vio el radar en este municipio, en una frase. */
  explicar: (s: SenalesDelMunicipio, proveedorMayor: string | null) => string;
  ejemplos?: (s: SenalesDelMunicipio) => EjemplosDeSenal | null;
  /** De dónde sale la regla, para quien pregunte. */
  fuente: string;
}

const licitaciones = (codigos: string[] | null): EjemplosDeSenal | null =>
  codigos?.length ? { tipo: "licitaciones", codigos } : null;

const proveedores = (
  lista: ProveedorDeUnaSenal[] | null,
): EjemplosDeSenal | null =>
  lista?.length ? { tipo: "proveedores", proveedores: lista } : null;

/** Las 13 señales, en el orden en que se muestran. */
export const SENALES: Senal[] = [
  {
    clave: "s_emergencias_recurrentes",
    titulo: "Emergencias repetidas",
    explicar: (s) =>
      `${s.emergencias_recurrentes} ${s.emergencias_recurrentes === 1 ? "proveedor recibió" : "proveedores recibieron"} 3 o más tratos directos por emergencia en 12 meses.`,
    ejemplos: (s) => proveedores(s.emergencias_recurrentes_detalle),
    fuente:
      "Contraloría objetó la recurrencia de emergencias en San Carlos; el informe propone alertar desde 3 en 12 meses.",
  },
  {
    clave: "s_trato_directo",
    titulo: "Mucho trato directo",
    explicar: (s) =>
      `El ${porcentaje(s.cuota_trato_directo)} de lo que compra es trato directo; el promedio de los municipios es ${porcentaje(s.promedio_trato_directo)}.`,
    fuente: "Contraloría (RADAR) y el Observatorio de ChileCompra.",
  },
  {
    clave: "s_proveedor_mayor",
    titulo: "Un proveedor concentra",
    explicar: (s, proveedorMayor) =>
      `${proveedorMayor ?? "Un proveedor"} se lleva el ${porcentaje(s.cuota_proveedor_mayor)} de lo que compra.`,
    fuente: "Validada en el estudio de Fazekas; umbral del informe: más de 40 %.",
  },
  {
    clave: "s_unica",
    titulo: "Un solo oferente",
    explicar: (s) =>
      `${s.unica} de sus ${s.licitaciones ?? 0} licitaciones adjudicadas tuvieron un solo oferente (${porcentaje(s.cuota_unica)}).`,
    fuente: "La señal más validada del informe (Fazekas, Banco Mundial).",
  },
  {
    clave: "s_compras_partidas",
    titulo: "Compras ágiles partidas",
    explicar: (s) =>
      `${s.compras_partidas} veces una unidad le compró el mismo día al mismo proveedor, y juntas las compras pasan las 100 UTM del tope.`,
    ejemplos: (s) => proveedores(s.compras_partidas_detalle),
    fuente: "Regla de fragmentación del Observatorio de ChileCompra.",
  },
  {
    clave: "s_bajo_el_tope",
    titulo: "Justo bajo el tope",
    explicar: (s) =>
      `${s.bajo_el_tope} de sus ${s.compras_agiles ?? 0} compras ágiles tienen un monto entre 95 y 100 UTM.`,
    fuente: "Apilamiento bajo el umbral, guía de la Open Contracting Partnership.",
  },
  {
    clave: "s_sobre_presupuesto",
    titulo: "Sobre el presupuesto",
    explicar: (s) =>
      `${s.sobre_presupuesto} licitaciones se adjudicaron más de 30 % sobre lo estimado.`,
    ejemplos: (s) => licitaciones(s.sobre_presupuesto_ejemplos),
    fuente: "Contraloría objetó a Padre Hurtado por adjudicar 30 % sobre lo estimado.",
  },
  {
    clave: "s_por_habitante",
    titulo: "Celebraciones por habitante",
    explicar: (s) =>
      `Gasta ${pesos(s.rubro_por_habitante)} por habitante en eventos y alimentación; el país, ${pesos(s.promedio_por_habitante)}.`,
    fuente: "El ranking de Contraloría sobre el gasto en celebraciones (CIC N°22).",
  },
  {
    clave: "s_tipo_no_calza",
    titulo: "Tipo que no calza",
    explicar: (s) =>
      `${s.tipo_no_calza} licitaciones de un tipo menor al que pedía su monto estimado (L1 hasta 100 UTM, LE hasta 1.000).`,
    ejemplos: (s) => licitaciones(s.tipo_no_calza_ejemplos),
    fuente: "Regla 11 del Observatorio de ChileCompra.",
  },
  {
    clave: "s_demora",
    titulo: "Demora en adjudicar",
    explicar: (s) =>
      `${s.demoras} licitaciones se adjudicaron mucho después de lo común para su tipo.`,
    ejemplos: (s) => licitaciones(s.demoras_ejemplos),
    fuente: "Período de decisión anómalo, validado en el estudio de Fazekas.",
  },
  {
    clave: "s_una_sola_cotizacion",
    titulo: "Una sola cotización",
    explicar: (s) =>
      `${s.una_sola_cotizacion} de sus ${s.con_elegida ?? 0} compras ágiles con ganador tuvieron una sola cotización.`,
    fuente: "Poca competencia, guía de la Open Contracting Partnership.",
  },
  {
    clave: "s_no_la_mas_barata",
    titulo: "No ganó la más barata",
    explicar: (s) =>
      `En ${s.no_la_mas_barata} de ${s.comparables ?? 0} licitaciones ganó una oferta que no era la más barata. No siempre es irregular: hay criterios además del precio.`,
    ejemplos: (s) => licitaciones(s.no_la_mas_barata_ejemplos),
    fuente: "Contraloría revisa las adjudicaciones contra las bases.",
  },
  {
    clave: "s_plazo_corto",
    titulo: "Plazo bajo el mínimo",
    explicar: (s) =>
      `${s.plazo_corto} licitaciones dieron menos días para ofertar que el mínimo legal.`,
    ejemplos: (s) => licitaciones(s.plazo_corto_ejemplos),
    fuente: "Validada en tres estudios; regla 10 del Observatorio.",
  },
];

/** Las señales que quedaron marcadas en un municipio. */
export const senalesActivas = (s: SenalesDelMunicipio | null): Senal[] =>
  s ? SENALES.filter((senal) => s[senal.clave] === true) : [];

export { urlMercadoPublico };
