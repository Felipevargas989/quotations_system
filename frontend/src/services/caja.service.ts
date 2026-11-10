import { apiRequest } from "./api";
import type { MedioDePago } from "../constants/facturacion";

/**
 * LA CAJA DE RECEPCIÓN (doc 19 §9.43, sprint 2). Quien opera la caja la
 * abre, anota los retiros y la cierra a ciegas: lo que recibe nunca trae lo
 * esperado. Quien revisa ve los cierres con lo declarado, lo esperado y la
 * diferencia por medio de pago.
 */

const base = "/facturacion/caja";

export interface RetiroDeCaja {
  id: number;
  monto: number;
  motivo: string;
  creado_en: string;
}

export interface CajaAbierta {
  id: number;
  abierta_por_nombre: string;
  abierta_en: string;
  sencillo_inicial: number;
  retiros: RetiroDeCaja[];
}

export interface EstadoDeLaCaja {
  abierta: CajaAbierta | null;
}

export type EstadoDelCierre = "abierta" | "por_revisar" | "revisada";

export interface CierreEnLaLista {
  id: number;
  abierta_por_nombre: string;
  abierta_en: string;
  sencillo_inicial: number;
  cerrada_por_nombre: string | null;
  cerrada_en: string | null;
  revisado_por_nombre: string | null;
  revisado_en: string | null;
  estado: EstadoDelCierre;
  vendido: number;
  declarado: number | null;
  diferencia: number | null;
  diferencias: { medio: MedioDePago; diferencia: number }[];
}

export interface LineaDelCuadre {
  medio: MedioDePago;
  vendido: number;
  esperado: number;
  declarado: number | null;
  diferencia: number | null;
  documentos: number;
}

export interface CierreDeCaja
  extends Omit<
    CierreEnLaLista,
    "vendido" | "declarado" | "diferencia" | "diferencias"
  > {
  comentario: string | null;
  nota_revision: string | null;
  cuadre: {
    lineas: LineaDelCuadre[];
    vendido: number;
    retiros: number;
    esperado: number;
    declarado: number | null;
    diferencia: number | null;
    porConfirmar: number;
    vendidoPorItem: {
      tarifario_id: number | null;
      nombre: string;
      cantidad: number;
      monto: number;
    }[];
  };
  documentos: {
    id: number;
    tipo: number;
    folio: number | null;
    estado: string;
    total: number;
    medio_de_pago: MedioDePago | null;
    emitido_en: string | null;
    /** §9.45: la solicitud de recepción que esta fila representa (la
     *  pendiente, la rechazada o la aprobada cuyo documento no salió). Su
     *  estado es «solicitud_pendiente», «solicitud_rechazada» o
     *  «solicitud_aprobada». */
    solicitud_id: number | null;
  }[];
  retiros: RetiroDeCaja[];
  correcciones: {
    id: number;
    documento_id: number | null;
    solicitud_id: number | null;
    medio_antes: string | null;
    medio_despues: string;
    corregido_por_nombre: string | null;
    created_at: string;
  }[];
}

export const getCaja = async (): Promise<EstadoDeLaCaja> =>
  (await apiRequest(base, "GET")) as EstadoDeLaCaja;

/** Se abre a nombre del perfil de la sesión: no se escribe quién. */
export const abrirCaja = async (datos: {
  sencillo: number;
}): Promise<EstadoDeLaCaja> =>
  (await apiRequest(`${base}/abrir`, "POST", datos)) as EstadoDeLaCaja;

export const anotarRetiro = async (datos: {
  monto: number;
  motivo: string;
}): Promise<EstadoDeLaCaja> =>
  (await apiRequest(`${base}/retiros`, "POST", datos)) as EstadoDeLaCaja;

/** El cierre ciego: responde solo cuándo cerró. */
export const cerrarCaja = async (datos: {
  efectivo: number;
  debito: number;
  credito: number;
  transferencia: number;
  comentario?: string | null;
}): Promise<{ cerrada_en: string }> =>
  (await apiRequest(`${base}/cerrar`, "POST", datos)) as {
    cerrada_en: string;
  };

export const getCierres = async (): Promise<CierreEnLaLista[]> =>
  (await apiRequest(`${base}/cierres`, "GET")) as CierreEnLaLista[];

export const getCierre = async (id: number): Promise<CierreDeCaja> =>
  (await apiRequest(`${base}/cierres/${id}`, "GET")) as CierreDeCaja;

export const corregirMedio = async (
  id: number,
  documentoId: number,
  medio: MedioDePago,
): Promise<CierreDeCaja> =>
  (await apiRequest(
    `${base}/cierres/${id}/documentos/${documentoId}`,
    "PATCH",
    {
      medio,
    },
  )) as CierreDeCaja;

/** §9.45: el medio de pago de una solicitud de recepción del turno. */
export const corregirMedioDeSolicitud = async (
  id: number,
  solicitudId: number,
  medio: MedioDePago,
): Promise<CierreDeCaja> =>
  (await apiRequest(
    `${base}/cierres/${id}/solicitudes/${solicitudId}`,
    "PATCH",
    { medio },
  )) as CierreDeCaja;

export const revisarCierre = async (
  id: number,
  nota: string | null,
): Promise<CierreDeCaja> =>
  (await apiRequest(`${base}/cierres/${id}/revisar`, "POST", {
    nota,
  })) as CierreDeCaja;

/** «Lo vendido» (sprint 3): lo del tarifario del período, por ítem. */
export interface LoVendido {
  desde: string;
  hasta: string;
  /** Quienes vendieron en el período, para elegir. */
  personas: string[];
  items: {
    tarifario_id: number | null;
    nombre: string;
    unidad: string;
    cantidad: number;
    monto: number;
  }[];
  total: number;
}

export const getLoVendido = async (q: {
  desde: string;
  hasta: string;
  persona?: string | null;
}): Promise<LoVendido> => {
  const p = new URLSearchParams({ desde: q.desde, hasta: q.hasta });
  if (q.persona) p.set("persona", q.persona);
  return (await apiRequest(
    `${base}/vendido?${p.toString()}`,
    "GET",
  )) as LoVendido;
};
