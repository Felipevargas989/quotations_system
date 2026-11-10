import { apiRequest } from "./api";
import type { MedioDePago } from "../constants/facturacion";
import type { LineaSuelta } from "./boletas.service";
import type { Ambiente, DtePedido } from "./facturas.service";

/**
 * LAS SOLICITUDES DE RECEPCIÓN (doc 19 §9.45). Recepción ya no emite: manda
 * la boleta o la factura al contado como solicitud, y quien tiene «Aprobar y
 * emitir solicitudes» la emite o la rechaza.
 */

const base = "/facturacion/solicitudes";

export type EstadoDeLaSolicitud =
  | "pendiente"
  | "emitiendo"
  | "aprobada"
  | "rechazada";

export interface Solicitud {
  id: number;
  /** 39 boleta, 33 factura. */
  tipo: number;
  estado: EstadoDeLaSolicitud;
  total: number;
  /** Nulo en la factura a crédito (§9.46): no entró plata a la caja. */
  medio_de_pago: MedioDePago | null;
  /** El plazo de la factura a crédito, en días. */
  plazo_dias: number | null;
  correo: string | null;
  /** Ya no se usa: el correo es obligatorio (§9.45). */
  imprimir: boolean;
  /** La razón social de la factura o la cabaña de la boleta. */
  para: string | null;
  rut: string | null;
  /** Cada línea con su monto con IVA. */
  lineas: { descripcion: string; cantidad: number; monto: number }[];
  turno_de_caja_id: number;
  solicitada_por_nombre: string;
  solicitada_por_cargo: string;
  created_at: string;
  resuelta_por_nombre: string | null;
  resuelta_en: string | null;
  motivo_rechazo: string | null;
  /** Lo que respondió la última emisión que no salió. */
  error: string | null;
  documento: {
    id: number;
    folio: number | null;
    estado: string;
    pdf_path: string | null;
  } | null;
  /** Otra solicitud del mismo día con el mismo tipo, total y medio. */
  igual_a: number | null;
}

export interface Aprobada {
  solicitud: Solicitud | null;
  documento: {
    id: number;
    tipo: number;
    folio: number | null;
    estado: string;
    total: number;
    ambiente: Ambiente;
    pdf_path: string | null;
  };
  aviso: string | null;
}

export const solicitarBoleta = async (datos: {
  lineas: LineaSuelta[];
  cabana?: string | null;
  correo?: string | null;
  medio_de_pago: MedioDePago | null;
}): Promise<Solicitud> =>
  (await apiRequest(`${base}/boleta`, "POST", datos)) as Solicitud;

export const solicitarFactura = async (pedida: DtePedido): Promise<Solicitud> =>
  (await apiRequest(`${base}/factura`, "POST", pedida)) as Solicitud;

/** Las del turno abierto: recepción ve cómo van las suyas. */
export const getSolicitudesDelTurno = async (): Promise<{
  solicitudes: Solicitud[];
}> =>
  (await apiRequest(`${base}/del-turno`, "GET")) as {
    solicitudes: Solicitud[];
  };

export const getSolicitudes = async (): Promise<{
  pendientes: number;
  solicitudes: Solicitud[];
}> =>
  (await apiRequest(base, "GET")) as {
    pendientes: number;
    solicitudes: Solicitud[];
  };

export const aprobarSolicitud = async (id: number): Promise<Aprobada> =>
  (await apiRequest(`${base}/${id}/aprobar`, "POST")) as Aprobada;

export const rechazarSolicitud = async (
  id: number,
  motivo: string | null,
): Promise<Solicitud> =>
  (await apiRequest(`${base}/${id}/rechazar`, "POST", {
    motivo,
  })) as Solicitud;
