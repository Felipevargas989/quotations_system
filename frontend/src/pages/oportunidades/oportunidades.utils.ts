import type {
  Anterior,
  EstadoOportunidad,
  Oportunidad,
  Semaforo,
  TipoProceso,
} from "../../services/oportunidades.service";
import { formatCurrency } from "../../utils/currencies";
import { matchesSearch } from "../../utils/searchMatch";

// Lo que la pantalla de Oportunidades necesita saber pintar y filtrar
// (doc 17 §5.3). Funciones puras: las pruebas las cubren enteras.

export const ESTADOS: ReadonlyArray<{
  readonly value: EstadoOportunidad;
  readonly label: string;
  readonly clases: string;
}> = [
  { value: "nueva", label: "Nueva", clases: "bg-blue-100 text-blue-800" },
  {
    value: "en_estudio",
    label: "En estudio",
    clases: "bg-amber-100 text-amber-800",
  },
  {
    value: "postulada",
    label: "Postulada",
    clases: "bg-purple-100 text-purple-800",
  },
  { value: "ganada", label: "Ganada", clases: "bg-green-100 text-green-800" },
  { value: "perdida", label: "Perdida", clases: "bg-gray-200 text-gray-700" },
  {
    value: "descartada",
    label: "Descartada",
    clases: "bg-gray-100 text-gray-500",
  },
];

export const SEMAFOROS: Record<
  Semaforo,
  { readonly label: string; readonly punto: string; readonly chip: string }
> = {
  verde: {
    label: "Verdes",
    punto: "bg-green-500",
    chip: "border-green-300 bg-green-50 text-green-800",
  },
  amarillo: {
    label: "Amarillas",
    punto: "bg-amber-400",
    chip: "border-amber-300 bg-amber-50 text-amber-800",
  },
  rojo: {
    label: "Rojas",
    punto: "bg-red-500",
    chip: "border-red-300 bg-red-50 text-red-800",
  },
};

export const ETIQUETAS: Record<string, string> = {
  evento: "Evento",
  alimentacion: "Alimentación",
  alojamiento: "Alojamiento",
  capacitacion_con_salon: "Capacitación con salón",
  paseo: "Paseo",
  otro: "Otro",
};

export const ALERTAS: Record<string, string> = {
  comuna_cercana: "Comuna cercana",
  alto_valor: "Alto valor",
};

export const SE_HACE_EN_EL_COMPLEJO: Record<string, string> = {
  si: "Se puede hacer en el complejo",
  no: "Se hace fuera del complejo",
  dudoso: "No dice dónde se hace",
};

/** Las 16 regiones, como las escribe Mercado Público. */
export const REGIONES_DE_CHILE = [
  "Arica y Parinacota",
  "Tarapacá",
  "Antofagasta",
  "Atacama",
  "Coquimbo",
  "Valparaíso",
  "Metropolitana",
  "O'Higgins",
  "Maule",
  "Ñuble",
  "Biobío",
  "La Araucanía",
  "Los Ríos",
  "Los Lagos",
  "Aysén",
  "Magallanes",
] as const;

/** Las vistas de la bandeja. "abiertas" = lo vigente que no está
 *  descartado ni resuelto; "historial" trae también lo ya cerrado. */
export type Vista =
  | "abiertas"
  | "nueva"
  | "en_estudio"
  | "postulada"
  | "descartada"
  | "historial";

export const VISTAS: ReadonlyArray<{ value: Vista; label: string }> = [
  { value: "abiertas", label: "Abiertas por decidir o en curso" },
  { value: "nueva", label: "Nuevas" },
  { value: "en_estudio", label: "En estudio" },
  { value: "postulada", label: "Postuladas" },
  { value: "descartada", label: "Descartadas" },
  { value: "historial", label: "Historial (también las cerradas)" },
];

const EN_CURSO: ReadonlySet<EstadoOportunidad> = new Set([
  "nueva",
  "en_estudio",
  "postulada",
]);

export type Filtros = {
  vista: Vista;
  semaforos: ReadonlyArray<Semaforo>;
  tipo: TipoProceso | "";
  region: string;
  busca: string;
};

export const FILTROS_DE_PARTIDA: Filtros = {
  vista: "abiertas",
  semaforos: ["verde", "amarillo"],
  tipo: "",
  region: "",
  busca: "",
};

const pasaLaVista = (o: Oportunidad, vista: Vista): boolean => {
  if (vista === "historial") return true;
  if (vista === "abiertas") return EN_CURSO.has(o.estado);
  return o.estado === vista;
};

/** Todo menos el semáforo: así los contadores de los chips dicen cuántas
 *  hay de cada color con los demás filtros puestos. */
export const filtrarSinSemaforo = (
  lista: readonly Oportunidad[],
  f: Filtros,
): Oportunidad[] =>
  lista.filter(
    (o) =>
      pasaLaVista(o, f.vista) &&
      (!f.tipo || o.proceso.tipo === f.tipo) &&
      (!f.region || o.proceso.region === f.region) &&
      matchesSearch(
        f.busca,
        o.proceso.nombre,
        o.proceso.organismo,
        o.proceso.unidad,
        o.proceso.comuna,
        o.codigo,
      ),
  );

export const filtrar = (
  lista: readonly Oportunidad[],
  f: Filtros,
): Oportunidad[] =>
  filtrarSinSemaforo(lista, f).filter(
    (o) => !o.semaforo || f.semaforos.includes(o.semaforo),
  );

export const contarPorSemaforo = (
  lista: readonly Oportunidad[],
): Record<Semaforo, number> => {
  const cuenta: Record<Semaforo, number> = { verde: 0, amarillo: 0, rojo: 0 };
  for (const o of lista) if (o.semaforo) cuenta[o.semaforo]++;
  return cuenta;
};

/** "cierra en 3 días", "cierra en 5 h", "cerrada": lo que se ve al lado
 *  del cierre. Urgente = cierra en 3 días o menos. */
export const cuandoCierra = (
  fecha: string | null,
  ahora: number = Date.now(),
): { texto: string; urgente: boolean; cerrada: boolean } => {
  const t = fecha ? new Date(fecha).getTime() : NaN;
  if (Number.isNaN(t)) {
    return { texto: "sin cierre informado", urgente: false, cerrada: false };
  }
  const horas = (t - ahora) / 3_600_000;
  if (horas <= 0) return { texto: "cerrada", urgente: false, cerrada: true };
  if (horas < 24) {
    const h = Math.max(1, Math.round(horas));
    return { texto: `cierra en ${h} h`, urgente: true, cerrada: false };
  }
  const dias = Math.floor(horas / 24);
  return {
    texto: `cierra en ${dias} ${dias === 1 ? "día" : "días"}`,
    urgente: dias <= 3,
    cerrada: false,
  };
};

/** La ficha pública en Mercado Público. */
export const urlMercadoPublico = (codigo: string, tipo: TipoProceso): string =>
  tipo === "licitacion"
    ? `https://www.mercadopublico.cl/Procurement/Modules/RFB/DetailsAcquisition.aspx?idlicitacion=${encodeURIComponent(codigo)}`
    : `https://buscador.mercadopublico.cl/ficha?code=${encodeURIComponent(codigo)}`;

/** PRIORIDAD (Felipe, 17-10: "hay dos que son directas mías y están en
 *  amarillo y deberían ser prioridad"): lo de una comuna cercana o de alto
 *  valor que no quedó en rojo va arriba, aunque la IA lo deje en amarillo
 *  por una duda (casi siempre: no dice dónde se hace). El color no se toca:
 *  lo decide la lectura. */
export const esPrioridad = (o: Pick<Oportunidad, "semaforo" | "alertas">) =>
  o.semaforo !== "rojo" &&
  o.alertas.some((a) => a === "comuna_cercana" || a === "alto_valor");

export const TIPOS: Record<TipoProceso, string> = {
  licitacion: "Licitación",
  compra_agil: "Compra ágil",
};

/** "2025: ganó SOL DE QUILLON SPA por $12.000.000 · 1 oferta" */
export const textoDelAnterior = (a: Anterior): string => {
  const quien =
    a.ganadores
      .map((g) =>
        g.monto != null
          ? `${g.nombre} por ${formatCurrency(g.monto, "CLP")}`
          : g.nombre,
      )
      .join(", ") || "sin ganador informado";
  const ofertas =
    a.oferentes != null
      ? ` · ${a.oferentes} ${a.oferentes === 1 ? "oferta" : "ofertas"}`
      : "";
  return `${a.anio ?? "Antes"}: ganó ${quien}${ofertas}`;
};
