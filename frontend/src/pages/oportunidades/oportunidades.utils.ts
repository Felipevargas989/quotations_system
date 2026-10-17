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

/** "30%", "30 puntos", "30,5 %" → 30 / 30,5; sin número, -1 (va al
 *  final). Sirve para ordenar los criterios de más a menos peso. */
export const pesoComoNumero = (peso: string): number => {
  const m = /(\d+(?:[.,]\d+)?)/.exec(peso ?? "");
  return m ? Number(m[1].replace(",", ".")) : -1;
};

/** Los criterios de más peso a menos (Felipe, 17-10: "destacar criterios
 *  es importante"). */
export const criteriosPorPeso = <T extends { peso: string }>(criterios: T[]) =>
  [...criterios].sort(
    (a, b) => pesoComoNumero(b.peso) - pesoComoNumero(a.peso),
  );

export const TIPOS_DE_REQUISITO: ReadonlyArray<[string, string]> = [
  ["administrativo", "Administrativos"],
  ["tecnico", "Técnicos"],
  ["economico", "Económicos"],
  ["garantia", "Garantías"],
  ["otro", "Otros"],
];

/** El checklist agrupado por tipo, en el orden de la casa, sin grupos
 *  vacíos. */
export const requisitosPorTipo = <T extends { tipo: string }>(
  requisitos: T[],
): Array<[string, T[]]> =>
  TIPOS_DE_REQUISITO.map(
    ([tipo, etiqueta]) =>
      [etiqueta, requisitos.filter((r) => r.tipo === tipo)] as [string, T[]],
  ).filter(([, lista]) => lista.length > 0);

/** US$0,42 */
export const textoDeCosto = (usd: number | null): string =>
  usd == null
    ? ""
    : `US$${usd.toLocaleString("es-CL", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}`;

/** La carpeta de documentos de la empresa (doc 17 §5.5): lo que suelen
 *  pedir las bases. Mismos valores que `TIPOS_DE_DOCUMENTO` del motor. */
export const TIPOS_DE_DOCUMENTO: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "patente", label: "Patente municipal" },
  { value: "inicio_actividades", label: "Inicio de actividades (SII)" },
  { value: "programa_integridad", label: "Programa de integridad" },
  { value: "f30", label: "Certificado F30 (antecedentes laborales)" },
  { value: "vigencia", label: "Certificado de vigencia de la sociedad" },
  { value: "resolucion_sanitaria", label: "Resolución sanitaria" },
  { value: "dj_trabajadores", label: "Declaración jurada de trabajadores" },
  { value: "otro", label: "Otro" },
];

export const etiquetaDeDocumento = (tipo: string): string =>
  TIPOS_DE_DOCUMENTO.find((t) => t.value === tipo)?.label ?? tipo;

/** Días entre dos fechas AAAA-MM-DD (b − a). */
const diasEntre = (a: string, b: string): number =>
  Math.round(
    (Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000,
  );

/** Cómo está un documento según su vencimiento: el aviso que reemplaza al
 *  correo (Felipe, 17-10: "sin correo, revisaré la app diario"). "pronto"
 *  = 30 días o menos. `hoy`, la fecha de Chile (hoyEnChile). */
export const estadoDeVencimiento = (
  vence: string | null,
  hoy: string,
): { texto: string; tono: "ok" | "pronto" | "vencido" | "sin" } => {
  if (!vence) return { texto: "No vence", tono: "sin" };
  const dias = diasEntre(hoy, vence);
  if (dias < 0) {
    return {
      texto: `Venció hace ${-dias} ${dias === -1 ? "día" : "días"}`,
      tono: "vencido",
    };
  }
  if (dias === 0) return { texto: "Vence hoy", tono: "pronto" };
  if (dias <= 30) {
    return {
      texto: `Vence en ${dias} ${dias === 1 ? "día" : "días"}`,
      tono: "pronto",
    };
  }
  const [a, m, d] = vence.split("-");
  return { texto: `Vigente hasta el ${d}/${m}/${a}`, tono: "ok" };
};

/** La ficha de un competidor en Eventia. */
export const urlCompetidor = (rut: string): string =>
  `/oportunidades/competidores/${encodeURIComponent(rut)}`;

/** "Noviembre de 2026", en hora de Chile. */
export const mesDe = (fecha: string): string => {
  const t = new Intl.DateTimeFormat("es-CL", {
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  }).format(new Date(fecha));
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** "Se viene" agrupado por mes, en el orden en que llega (ya viene por
 *  fecha). */
export const agruparPorMes = <T extends { esperada: string }>(
  items: T[],
): Array<[string, T[]]> => {
  const grupos: Array<[string, T[]]> = [];
  for (const item of items) {
    const mes = mesDe(item.esperada);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo[0] === mes) ultimo[1].push(item);
    else grupos.push([mes, [item]]);
  }
  return grupos;
};

/** "Salió en 2025" · "Salió en 2023, 2024 y 2025". */
export const textoDeAnios = (anios: number[]): string => {
  if (anios.length === 0) return "";
  if (anios.length === 1) return `Salió en ${anios[0]}`;
  return `Salió en ${anios.slice(0, -1).join(", ")} y ${anios[anios.length - 1]}`;
};

/** BASES Y ANEXOS (doc 17 §12 punto 8): lo que se puede subir, lo mismo
 *  que acepta el motor (`TIPOS_POR_EXTENSION`, adjuntos.service.ts). */
export const EXTENSIONES_DE_ADJUNTOS: ReadonlyArray<string> = [
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "odt",
  "ods",
  "zip",
  "rar",
  "7z",
  "txt",
  "csv",
  "jpg",
  "jpeg",
  "png",
  "webp",
];
export const MAX_MB_POR_ADJUNTO = 30;

/** Por qué no se puede subir ese archivo; null = se puede. Se revisa antes
 *  de mandarlo, para no esperar a que suban 30 MB que el motor rechazaría. */
export const problemaDelAdjunto = (archivo: {
  name: string;
  size: number;
}): string | null => {
  const punto = archivo.name.lastIndexOf(".");
  const ext = punto > 0 ? archivo.name.slice(punto + 1).toLowerCase() : "";
  if (!EXTENSIONES_DE_ADJUNTOS.includes(ext)) {
    return `"${archivo.name}" no se puede subir: sirven PDF, Word, Excel, PowerPoint, ZIP, RAR, 7z, texto e imágenes.`;
  }
  if (archivo.size <= 0) return `"${archivo.name}" está vacío.`;
  if (archivo.size > MAX_MB_POR_ADJUNTO * 1024 * 1024) {
    return `"${archivo.name}" pesa más de ${MAX_MB_POR_ADJUNTO} MB.`;
  }
  return null;
};

/** 1.234.567 bytes → "1,2 MB". */
export const tamanoLegible = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toLocaleString("es-CL", {
    maximumFractionDigits: 1,
  })} MB`;
};

/** El visor de la casa (FileViewLink) muestra PDF e imágenes; Word, Excel
 *  y ZIP se descargan. Se mira la RUTA guardada, igual que el visor. */
export const seVeEnElVisor = (ruta: string): boolean =>
  /\.(pdf|jpe?g|png|webp)$/i.test(ruta);

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
