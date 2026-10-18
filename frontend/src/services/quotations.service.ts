import { API_ROUTES } from "../constants/api.routes";
import {
  Quotation,
  QuotationCreateData,
  QuotationFormDataUpdate,
  QuotationPublicFormData,
  QuotationRequestType,
  QuotationStatus,
  QuotationWithClient,
} from "../types/quotations.types";
import { apiRequest } from "./api";

export const getQuotations = async (
  requirementType?: QuotationRequestType,
  statuses?: QuotationStatus[],
  sort_by?: "quotation_number" | "event_date",
  sort_order?: "asc" | "desc",
  /** Solo eventos desde esta fecha (YYYY-MM-DD): para no traer la
   *  historia completa cuando basta con los últimos meses. */
  eventDateFrom?: string,
) => {
  let requestTypeParam = "";
  if (requirementType !== undefined) {
    requestTypeParam = `request_type=${requirementType}`;
  }
  const statusesParam = statuses ? `&statuses=${statuses.join(",")}` : "";
  const sortByParam = sort_by ? `&sort_by=${sort_by}` : "";
  const sortOrderParam = sort_order ? `&sort_order=${sort_order}` : "";
  const fromParam = eventDateFrom ? `&event_date_from=${eventDateFrom}` : "";
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}?${requestTypeParam}${statusesParam}${sortByParam}${sortOrderParam}${fromParam}`,
    "GET",
  );
  return { data: response as QuotationWithClient[] };
};

// Declara el evento REALIZADO: cambia el estado y el backend envía la
// encuesta de satisfacción al cliente (una sola vez).
export interface MarkEventDoneResult {
  quotation_status: string;
  survey_sent: boolean;
  survey_already_sent: boolean;
  client_has_email: boolean;
}
export const markEventDone = async (quotationId: string) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}/realizado`,
    "POST",
  );
  return response as MarkEventDoneResult;
};

// La puerta de vuelta (solo administrador): des-marca un realizado.
export const unmarkEventDone = async (quotationId: string) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}/volver-a-pendiente`,
    "POST",
  );
  return response as { ok: boolean };
};

// La palabra final de Felipe sobre una fila de la cosecha del mes.
// `estado` en null borra la corrección y devuelve el mando a la
// sugerencia automática (cruce empresa + mandante + tipo de evento).
export const guardarEstadoCosecha = async (
  quotationId: string,
  estado: string | null,
) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}/cosecha`,
    "POST",
    { estado },
  );
  return response as { ok: boolean; estado: string | null };
};

export const deleteQuotation = async (quotationId: string) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}`,
    "DELETE",
  );

  return { error: response.error };
};

// Crear autenticado (POST /quotations). El tipo correcto es el del
// formulario INTERNO (Fase 2 Bloque C): antes decía por error
// QuotationPublicFormData, que es el del formulario público sin sesión.
export const createQuotation = async (quotation: QuotationCreateData) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}`,
    "POST",
    quotation,
  );
  return { data: response as Quotation, error: response.error };
};

export const createQuotationPublic = async (
  companyId: string,
  quotation: QuotationPublicFormData,
) => {
  const ruta = `${API_ROUTES.QUOTATIONS}/public/${companyId}`;
  const response = await apiRequest(ruta, "POST", quotation);
  // RED DE SEGURIDAD (migración 110): el motor rechaza de plano los
  // campos que no conoce (forbidNonWhitelisted). Si esta vitrina llegara
  // a producción antes que el motor que entiende `origen_detalle`, se
  // caerían TODAS las cotizaciones del formulario público. Perder el
  // dato de origen cuesta infinitamente menos que perder la cotización:
  // si el primer intento falla, se reintenta sin esa marca.
  if (response.error && quotation.origen_detalle) {
    const sinOrigen = { ...quotation };
    delete sinOrigen.origen_detalle;
    const reintento = await apiRequest(ruta, "POST", sinOrigen);
    return { data: reintento as Quotation, error: reintento.error };
  }
  return { data: response as Quotation, error: response.error };
};

export const updateQuotation = async (
  quotation: QuotationFormDataUpdate,
  quotationId: string,
) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}`,
    "PATCH",
    quotation,
  );
  return { data: response as Quotation, error: response.error };
};

export const getQuotationById = async (quotationId: string) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}`,
    "GET",
  );
  return { data: response.data as Quotation, error: response.error };
};

export const checkConflictsWithExistingQuotations = async (
  eventDate: string,
  eventEndDate?: string,
  // Al editar: la propia cotización/requerimiento no es un choque.
  excludeId?: string,
) => {
  const response = await apiRequest(
    `${API_ROUTES.QUOTATIONS_CHECK_CONFLICTS}`,
    "GET",
    undefined,
    {
      event_date: eventDate,
      ...(eventEndDate ? { event_end_date: eventEndDate } : {}),
      ...(excludeId ? { exclude_id: excludeId } : {}),
    },
  );
  return {
    data: response as { has_conflicts: boolean },
    error: response.error,
  };
};

// ---- Enviar cotización por correo (doc 13) ----

/** El botón de la ficha: correo tipo + PDF del motor adjunto. */
export const enviarCotizacionPorCorreo = async (quotationId: string) =>
  (await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}/enviar-correo`,
    "POST",
    {},
  )) as { enviado_a: string };

/** El botón «✨ Crear con IA» (17-10-2026, doc 16 §6): el motor arma el
 *  requerimiento con Claude y lo deja en solicitada. Tarda cerca de un
 *  minuto; nunca envía nada. */
export const generarConIA = async (quotationId: string) =>
  (await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}/generar`,
    "POST",
    {},
  )) as {
    quotation_number: number;
    total_amount: number;
    value_per_person: number;
    nota: string;
    segundos: number;
    costo_usd: number | null;
  };

// ---- «✉ Generar seguimiento» (17-10-2026, doc 18) ----

/** Una cotización cuyo próximo contacto venció y es por correo. */
export type SeguimientoPendiente = {
  id: string;
  quotation_number: number;
  estado: string;
  cliente: string;
  tipo_evento: string | null;
  /** AAAA-MM-DD del compromiso vencido. */
  proximo: string;
  dias_vencido: number;
  nota: string;
  /** El borrador de la IA que espera en Outlook a que alguien lo envíe
   *  (doc 18 §9). Opcional: un motor anterior no lo manda. */
  borrador?: BorradorEnEspera | null;
};

/** Un borrador de la IA que todavía no sale de Outlook. */
export type BorradorEnEspera = {
  buzon: string;
  enlace: string | null;
  /** ISO: cuándo quedó. */
  creado: string;
};

/** Lo que encontró el motor al mirar Outlook. */
export type RevisionDeSeguimientos = {
  revisados: number;
  /** Cotizaciones cuyo borrador salió (con su línea en la bitácora) o se
   *  descartó. */
  cambiaron: string[];
};

/** Lo que dejó el motor: un borrador en Outlook, o por qué se saltó. */
export type ResultadoDelSeguimiento = {
  quotation_number: number;
  accion: "borrador" | "saltada";
  motivo: string | null;
  buzon: string | null;
  modo: "seguimiento" | "responder" | "nuevo" | null;
  /** Para abrir el borrador en Outlook web. */
  enlace: string | null;
  angulo: string | null;
  segundos: number;
  costo_usd: number | null;
};

/** Las que piden seguimiento por correo hoy, las más vencidas primero. */
export const getSeguimientosPendientes = async () =>
  (await apiRequest(
    `${API_ROUTES.QUOTATIONS}/seguimiento/pendientes`,
    "GET",
  )) as SeguimientoPendiente[];

/** Al abrir Cotizaciones (doc 18 §9): el motor le pregunta a Outlook si los
 *  borradores que esperan ya salieron y, si salieron, anota el envío. */
export const revisarSeguimientos = async () =>
  (await apiRequest(
    `${API_ROUTES.QUOTATIONS}/seguimiento/revisar`,
    "POST",
    {},
  )) as RevisionDeSeguimientos;

/** El motor escribe el seguimiento con IA y lo deja de BORRADOR en el hilo
 *  del cliente (o en un correo nuevo). Nunca envía. */
export const generarSeguimiento = async (quotationId: string) =>
  (await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}/seguimiento`,
    "POST",
    {},
  )) as ResultadoDelSeguimiento;

// ---- Choques de fecha (18-10-2026, mapa 02 §5.6) ----

/** Una cotización viva cuyas fechas se topan con una aceptada. */
export type ChoqueDeFecha = {
  quotation_id: string;
  quotation_number: number;
  aceptada: {
    id: string;
    numero: number;
    cliente: string | null;
    /** AAAA-MM-DD. */
    desde: string;
    hasta: string;
    exclusiva: boolean;
  };
};

/** Los topes de calendario de la empresa. */
export const getChoquesDeFecha = async () =>
  (await apiRequest(
    `${API_ROUTES.QUOTATIONS}/choques/pendientes`,
    "GET",
  )) as ChoqueDeFecha[];

/** «Sí, puede seguir» para un tope: la cotización sigue con su fecha. */
export const seguirConLaFecha = async (
  quotationId: string,
  aceptadaId: string,
) =>
  (await apiRequest(
    `${API_ROUTES.QUOTATIONS}/${quotationId}/choques/${aceptadaId}`,
    "POST",
    { decision: "puede_seguir" },
  )) as { nota: string };

/** La hoja pública que imprime el navegador invisible del motor. */
export const getHojaParaImprimir = async (token: string) =>
  (await apiRequest(`${API_ROUTES.QUOTATIONS}/imprimir/${token}`, "GET")) as {
    quotation: import("../utils/quotationPrintDoc").PrintQuotation;
    empresa: import("../utils/quotationPrintDoc").PrintCompany;
    menu?: import("../utils/quotationPrintDoc").PrintMenu | null;
  };
