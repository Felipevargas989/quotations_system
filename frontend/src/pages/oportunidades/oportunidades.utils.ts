import type {
  AdjuntoDeOportunidad,
  Anterior,
  Generacion,
  OrigenDeArchivo,
  Oportunidad,
  Semaforo,
  TipoDeGeneracion,
  TipoProceso,
} from "../../services/oportunidades.service";
import { formatCurrency } from "../../utils/currencies";
import { matchesSearch } from "../../utils/searchMatch";

// Lo que la pantalla de Oportunidades necesita saber pintar y filtrar
// (doc 17 §5.3). Funciones puras: las pruebas las cubren enteras.

export { ESTADOS } from "./estadosDeOportunidad";
export {
  ESTILO_DEL_PASO,
  type EstadoDelPaso,
  type PasoDelAvance,
  pasosDelAvance,
} from "./pasosDelAvance";

/** EL ROJO ES RECICLAJE (decisión 72, 23-10). Felipe: "el rojo puede ser
 *  reciclaje, cosas que la IA rechazó pero que vale la pena ver... y otras
 *  que estén sencillamente descartadas porque no son". La base guarda el
 *  color de la IA; la lista parte el rojo en dos: el de tu zona y de tu
 *  rubro (con el aviso de comuna cercana) es el reciclaje, y el resto, la
 *  basura (unas 550 al día). */
export type ColorDeLaLista = Semaforo | "basura";

export const colorDe = (
  semaforo: Semaforo | null,
  reciclaje: boolean,
): ColorDeLaLista | null =>
  semaforo === "rojo" && !reciclaje ? "basura" : semaforo;

export const colorDeLaOportunidad = (
  o: Pick<Oportunidad, "semaforo" | "alertas">,
): ColorDeLaLista | null =>
  colorDe(o.semaforo, o.alertas.includes("comuna_cercana"));

export const SEMAFOROS: Record<
  ColorDeLaLista,
  {
    readonly label: string;
    readonly punto: string;
    readonly chip: string;
    readonly ayuda: string;
  }
> = {
  verde: {
    label: "Verdes",
    punto: "bg-green-500",
    chip: "border-green-300 bg-green-50 text-green-800",
    ayuda: "La IA dice que calzan con lo que vendes",
  },
  amarillo: {
    label: "Amarillas",
    punto: "bg-amber-400",
    chip: "border-amber-300 bg-amber-50 text-amber-800",
    ayuda: "La IA dice que hay que evaluarlas",
  },
  rojo: {
    label: "Reciclaje",
    punto: "bg-red-500",
    chip: "border-red-300 bg-red-50 text-red-800",
    ayuda:
      "La IA dice que no, pero son de tu zona y de tu rubro: vale la pena mirarlas",
  },
  basura: {
    label: "Basura",
    punto: "bg-gray-400",
    chip: "border-gray-300 bg-gray-100 text-gray-700",
    ayuda:
      "Todo lo demás que la IA rechazó. Queda guardado, por si un día buscas algo",
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

/** Los montones de la bandeja, como botones con su número (18-10). Abre en
 *  "nueva" = Por revisar: lo que todavía nadie decidió (Felipe, 17-10: "que
 *  las que pincho me interesa ya no aparezcan acá... solo queda lo nuevo a
 *  revisar"). Lo en estudio y lo postulado vive en «Mis licitaciones», no
 *  acá: tenerlo en los dos lados confunde. "historial" trae todo, también
 *  lo ya cerrado. */
export type Vista = "nueva" | "descartada" | "seguida" | "historial";

export const VISTAS: ReadonlyArray<{
  value: Vista;
  label: string;
  ayuda: string;
}> = [
  {
    value: "nueva",
    label: "Por revisar",
    ayuda: "Lo nuevo que nadie ha decidido",
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

export type Filtros = {
  vista: Vista;
  semaforos: ReadonlyArray<ColorDeLaLista>;
  tipo: TipoProceso | "";
  region: string;
  busca: string;
};

export const FILTROS_DE_PARTIDA: Filtros = {
  vista: "nueva",
  semaforos: ["verde", "amarillo"],
  tipo: "",
  region: "",
  busca: "",
};

const pasaLaVista = (o: Oportunidad, vista: Vista): boolean =>
  vista === "historial" || o.estado === vista;

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

/** Lo sin leer pasa siempre: se ve sin color. */
export const pasaElSemaforo = (
  o: Pick<Oportunidad, "semaforo" | "alertas">,
  semaforos: ReadonlyArray<ColorDeLaLista>,
): boolean => {
  const color = colorDeLaOportunidad(o);
  return !color || semaforos.includes(color);
};

export const filtrar = (
  lista: readonly Oportunidad[],
  f: Filtros,
): Oportunidad[] =>
  filtrarSinSemaforo(lista, f).filter((o) => pasaElSemaforo(o, f.semaforos));

export const contarPorSemaforo = (
  lista: readonly Oportunidad[],
): Record<ColorDeLaLista, number> => {
  const cuenta: Record<ColorDeLaLista, number> = {
    verde: 0,
    amarillo: 0,
    rojo: 0,
    basura: 0,
  };
  for (const o of lista) {
    const color = colorDeLaOportunidad(o);
    if (color) cuenta[color]++;
  }
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

/** VALIDAR DOCUMENTOS (doc 17, sprint 3, paso 3): cómo queda cada
 *  requisito, en el orden en que se muestran los conteos. */
export const ESTADOS_DE_VALIDACION: ReadonlyArray<{
  value: "cumple" | "falta" | "vencido" | "revisar";
  label: string;
  plural: string;
  clases: string;
}> = [
  {
    value: "cumple",
    label: "Cumple",
    plural: "cumplen",
    clases: "bg-green-50 text-green-700",
  },
  {
    value: "falta",
    label: "Falta",
    plural: "faltan",
    clases: "bg-red-50 text-red-700",
  },
  {
    value: "vencido",
    label: "Vencido",
    plural: "vencidos",
    clases: "bg-red-50 text-red-700",
  },
  {
    value: "revisar",
    label: "Revisar",
    plural: "por revisar",
    clases: "bg-amber-100 text-amber-800",
  },
];

/** Cuántos requisitos hay en cada estado. */
export const contarPorEstadoDeValidacion = (
  requisitos: Array<{ estado: string }>,
): Record<"cumple" | "falta" | "vencido" | "revisar", number> => {
  const conteo = { cumple: 0, falta: 0, vencido: 0, revisar: 0 };
  for (const r of requisitos) {
    if (r.estado in conteo) conteo[r.estado as keyof typeof conteo] += 1;
  }
  return conteo;
};

/** LA FICHA ORDENADA (Felipe, 17-10: "quedó muy desordenado... difícil
 *  de leer"). Arriba solo lo que deja fuera (máximo 5); lo demás, plegado.
 *  Un análisis anterior al 17-10 trae todo junto en `alertas`: se muestra
 *  plegado y sin separar, y volver a analizar lo ordena. */
export const alertasDelAnalisis = (r: {
  te_dejan_fuera?: string[];
  condiciones?: string[];
  alertas?: string[];
}): { dejanFuera: string[]; condiciones: string[]; separadas: boolean } =>
  r.te_dejan_fuera
    ? {
        dejanFuera: r.te_dejan_fuera.slice(0, 5),
        condiciones: [...r.te_dejan_fuera.slice(5), ...(r.condiciones ?? [])],
        separadas: true,
      }
    : { dejanFuera: [], condiciones: r.alertas ?? [], separadas: false };

/** El veredicto de arriba: ¿se puede subir así? */
export const LISTO_PARA_POSTULAR: Record<
  "si" | "casi" | "no",
  { titulo: string; clases: string }
> = {
  si: {
    titulo: "Lista para postular",
    clases: "bg-green-50 border-green-200 text-green-800",
  },
  casi: {
    titulo: "Casi lista: faltan detalles",
    clases: "bg-amber-50 border-amber-200 text-amber-900",
  },
  no: {
    titulo: "Todavía no: falta algo obligatorio",
    clases: "bg-red-50 border-red-200 text-red-800",
  },
};

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
  {
    value: "f30_1",
    label: "Certificado F30-1 (cumplimiento de obligaciones laborales)",
  },
  { value: "vigencia", label: "Certificado de vigencia de la sociedad" },
  { value: "resolucion_sanitaria", label: "Resolución sanitaria" },
  { value: "dj_trabajadores", label: "Declaración jurada de trabajadores" },
  // Lo general para contratar (decisión 38): va en «4. Otros» del ZIP.
  { value: "erut", label: "e-RUT (SII)" },
  { value: "no_quiebra", label: "Certificado de no quiebra" },
  { value: "estatutos", label: "Escritura de constitución y estatutos" },
  {
    value: "respaldo_experiencia",
    label: "Respaldo de experiencia (orden de compra o factura)",
  },
  // Va siempre en el ZIP detrás de la patente (decisión 61).
  {
    value: "respaldo_patente",
    label: "Respaldo de la patente (contrato, comodato o dictamen)",
  },
  { value: "otro", label: "Otro" },
];

/** El contrato de arriendo o comodato de una patente de otro, y lo que lo
 *  valida (decisión 61): mismo valor que `TIPO_RESPALDO_PATENTE` del motor. */
export const TIPO_RESPALDO_PATENTE = "respaldo_patente";

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

/** El visor de la casa (FileViewLink) muestra PDF, imágenes y, desde el
 *  19-10 (decisión 46), Word (.docx); el .doc antiguo, Excel y ZIP se
 *  descargan. Se mira la RUTA guardada, igual que el visor. */
export const seVeEnElVisor = (ruta: string): boolean =>
  /\.(pdf|jpe?g|png|webp|docx)$/i.test(ruta);

/** PRIORIDAD (Felipe, 17-10: "hay dos que son directas mías y están en
 *  amarillo y deberían ser prioridad"): lo de tu rubro (verde o amarillo) en
 *  una comuna cercana va arriba, aunque la IA lo deje en amarillo por una
 *  duda (casi siempre: no dice dónde se hace). El color no se toca: lo
 *  decide la lectura. Desde la decisión 64 (20-10) el monto no cuenta
 *  (Felipe: "algo puede tener 60 millones, pero si es de Concepción
 *  difícilmente lo logre traer para acá... para mí prioridad son las
 *  licitaciones de mi rubro que estén en Quillón o en todas sus comunas"). */
export const esPrioridad = (o: Pick<Oportunidad, "semaforo" | "alertas">) =>
  o.semaforo !== "rojo" && o.alertas.includes("comuna_cercana");

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

/** DOCUMENTOS CON IA (doc 17, sprint 3, paso 4). La oferta la pone la
 *  empresa con IVA (Felipe: "valores con IVA porque se factura"); el neto
 *  y el IVA se calculan igual que en el motor, nunca los inventa la IA. */
export const IVA = 0.19;

export const desgloseDeOferta = (total: number) => {
  const neto = Math.round(total / (1 + IVA));
  return { total, neto, iva: total - neto };
};

/** Lo que se puede llenar o firmar: Word moderno (.docx). Un .doc antiguo
 *  hay que guardarlo como .docx primero. */
export const esWordModerno = (nombre: string): boolean =>
  /\.docx$/i.test(nombre);

/** El sello de cada archivo de «Mi postulación» según de dónde salió; lo
 *  subido por una persona no lleva sello. */
export const ORIGENES: Record<
  OrigenDeArchivo,
  { readonly label: string; readonly clases: string } | null
> = {
  subido: null,
  generado: {
    label: "Hecho con IA · sin firma",
    clases: "bg-amber-100 text-amber-800",
  },
  firmado: { label: "Firmado", clases: "bg-green-100 text-green-800" },
};

/** La firma va en dos tiempos (decidido el 17-10): se firma un Word que
 *  todavía no está firmado, después de revisarlo. */
export const sePuedeFirmar = (
  a: Pick<AdjuntoDeOportunidad, "nombre" | "origen">,
): boolean => a.origen !== "firmado" && esWordModerno(a.nombre);

export const TEXTOS_DE_GENERACION: Record<
  TipoDeGeneracion,
  { readonly trabajando: string; readonly titulo: string }
> = {
  anexos: {
    trabajando:
      "La IA está llenando los anexos… suele tardar entre 3 y 8 minutos.",
    titulo: "Anexos llenos",
  },
  firma: {
    trabajando: "La IA está poniendo la firma… suele tardar 1 a 3 minutos.",
    titulo: "Firma",
  },
  propuesta: {
    trabajando:
      "La IA está escribiendo la propuesta técnica… suele tardar entre 5 y 10 minutos.",
    titulo: "Propuesta técnica",
  },
};

export const algunaEnCurso = (
  g: Partial<Record<TipoDeGeneracion, Generacion | null>> | null | undefined,
): boolean => Object.values(g ?? {}).some((x) => x?.estado === "procesando");

/** «Mis licitaciones» en dos listas (Felipe, 19-10: "ordenar por
 *  pendientes, ya postuladas abajo y de algún color diferente para saber
 *  que están listas... y por orden de vencimiento"). Por postular: las en
 *  estudio, de la que vence antes a la que vence después, y al final las
 *  que ya cerraron sin postular (la más reciente primero). Postuladas,
 *  aparte. Terminadas: ganadas o perdidas. `enCurso` (las dos primeras) es
 *  el número de la pestaña. */
export const separarMias = <
  T extends { estado: string; proceso?: { fecha_cierre: string | null } },
>(
  lista: T[],
  ahora: number = Date.now(),
) => {
  const cierre = (m: T) => {
    const fecha = m.proceso?.fecha_cierre;
    return fecha ? Date.parse(fecha) : Number.POSITIVE_INFINITY;
  };
  const antes = (a: T, b: T) => cierre(a) - cierre(b) || 0;
  const enEstudio = lista.filter((m) => m.estado === "en_estudio");
  const porPostular = [
    ...enEstudio.filter((m) => cierre(m) >= ahora).sort(antes),
    ...enEstudio.filter((m) => cierre(m) < ahora).sort((a, b) => antes(b, a)),
  ];
  const postuladas = lista.filter((m) => m.estado === "postulada").sort(antes);
  return {
    porPostular,
    postuladas,
    enCurso: [...porPostular, ...postuladas],
    terminadas: lista.filter(
      (m) => m.estado === "ganada" || m.estado === "perdida",
    ),
  };
};

/** Cómo se llama la fecha del servicio en las bases, de lo más claro a lo
 *  menos. "Evento" a secas no sirve: "entrega del cronograma del evento"
 *  también lo dice (visto en el Día del Funcionario, 17-10). */
const FECHA_DEL_SERVICIO = [
  /^fecha del (servicio|evento)/i,
  /(realizaci|ejecuci)[oó]n del (servicio|evento)/i,
  /fecha.*(servicio|evento)/i,
];

/** "En una mirada": cuándo es el evento. Un análisis anterior al 17-10 no
 *  trae `fecha_del_servicio`: se busca en sus fechas la del servicio. */
export const fechaDelEvento = (r: {
  fecha_del_servicio?: string;
  fechas: Array<{ que: string; cuando: string }>;
}): string => {
  const directa = r.fecha_del_servicio?.trim();
  if (directa) return directa;
  for (const patron of FECHA_DEL_SERVICIO) {
    const f = r.fechas.find((x) => patron.test(x.que));
    if (f) return f.cuando;
  }
  return "";
};

/** El tono del lugar: se puede en el complejo, no, o no queda claro. */
export const TONO_DEL_LUGAR: Record<string, string> = {
  si: "text-green-700",
  no: "text-red-700",
  dudoso: "text-amber-700",
};

/** Lo que sugiere la IA de cada exigencia («¿Puedo cumplir?», 17-10; desde
 *  el 19-10, en «Exigencias de la licitación»): cómo se ve. */
export const ESTILO_DE_CUMPLIMIENTO: Record<
  "tengo" | "conseguir" | "no_se_puede",
  { label: string; plural: string; clases: string }
> = {
  no_se_puede: {
    label: "No se puede",
    plural: "no se pueden",
    clases: "bg-red-100 text-red-800",
  },
  conseguir: {
    label: "Conseguir",
    plural: "hay que conseguir",
    clases: "bg-amber-100 text-amber-800",
  },
  tengo: {
    label: "Lo tienes",
    plural: "las tienes",
    clases: "bg-green-100 text-green-800",
  },
};
