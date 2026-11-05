import { apiRequest } from "./api";
import type { Ambiente } from "./facturas.service";

// Las boletas de recepción (migración 187, doc 19, paso 3a). El
// administrador deja un cobro «por boletear» (desde el evento o suelto) y
// recepción lo reparte por cabaña y emite una boleta por cabaña. Cada
// cambio queda anotado con quién lo hizo (E3). La empresa sale SIEMPRE de
// la sesión, en el motor.

export interface LineaDelCobro {
  id: number;
  cabana: string;
  monto: number;
  correo: string | null;
  /** La boleta, si ya salió. */
  folio: number | null;
  estado: string | null;
  pdf_path: string | null;
}

export interface CambioDelCobro {
  que: string;
  antes: string | null;
  despues: string | null;
  nombre: string | null;
  created_at: string;
  /** La cabaña del cambio, si sigue en el reparto. */
  cabana: string | null;
}

export interface CobroPorBoletear {
  id: number;
  quotation_id: string | null;
  /** El N° de la cotización, si viene de un evento. */
  numero: number | null;
  descripcion: string;
  total: number;
  creado_por_nombre: string | null;
  created_at: string;
  lineas: LineaDelCobro[];
  cambios: CambioDelCobro[];
  repartido: number;
  boleteado: number;
  /** Lo que falta repartir; negativo si sobra. */
  falta: number;
  porEmitir: number;
}

export interface BoletaDelDia {
  id: number;
  folio: number | null;
  estado: string;
  ambiente: Ambiente;
  total: number;
  cabana: string | null;
  descripcion: string | null;
  correo: string | null;
  pdf_path: string | null;
  emitido_en: string | null;
}

export interface DatosDeLaLinea {
  cabana: string;
  monto: number;
  correo?: string | null;
}

const base = "/boletas";

export const getPorBoletear = async (
  quotationId?: string,
): Promise<{ ambiente: Ambiente; cobros: CobroPorBoletear[] }> =>
  (await apiRequest(
    `${base}/por-boletear${quotationId ? `?quotation_id=${encodeURIComponent(quotationId)}` : ""}`,
    "GET",
  )) as { ambiente: Ambiente; cobros: CobroPorBoletear[] };

export const getEmitidasHoy = async (): Promise<{
  fecha: string;
  ambiente: Ambiente;
  boletas: BoletaDelDia[];
}> =>
  (await apiRequest(`${base}/emitidas-hoy`, "GET")) as {
    fecha: string;
    ambiente: Ambiente;
    boletas: BoletaDelDia[];
  };

export const crearCobro = async (datos: {
  quotation_id?: string | null;
  descripcion: string;
  total: number;
}): Promise<CobroPorBoletear> =>
  (await apiRequest(`${base}/cobros`, "POST", datos)) as CobroPorBoletear;

export const editarCobro = async (
  id: number,
  cambios: { descripcion?: string; total?: number },
): Promise<CobroPorBoletear> =>
  (await apiRequest(
    `${base}/cobros/${id}`,
    "PATCH",
    cambios,
  )) as CobroPorBoletear;

export const borrarCobro = async (id: number): Promise<void> => {
  await apiRequest(`${base}/cobros/${id}`, "DELETE");
};

export const agregarLinea = async (
  cobroId: number,
  datos: DatosDeLaLinea,
): Promise<CobroPorBoletear> =>
  (await apiRequest(
    `${base}/cobros/${cobroId}/lineas`,
    "POST",
    datos,
  )) as CobroPorBoletear;

export const editarLinea = async (
  cobroId: number,
  lineaId: number,
  cambios: Partial<DatosDeLaLinea>,
): Promise<CobroPorBoletear> =>
  (await apiRequest(
    `${base}/cobros/${cobroId}/lineas/${lineaId}`,
    "PATCH",
    cambios,
  )) as CobroPorBoletear;

export const quitarLinea = async (
  cobroId: number,
  lineaId: number,
): Promise<CobroPorBoletear> =>
  (await apiRequest(
    `${base}/cobros/${cobroId}/lineas/${lineaId}`,
    "DELETE",
  )) as CobroPorBoletear;

export const emitirBoletas = async (
  cobroId: number,
): Promise<{
  cobro: CobroPorBoletear;
  emitidas: number[];
  aviso: string | null;
}> =>
  (await apiRequest(`${base}/cobros/${cobroId}/emitir`, "POST")) as {
    cobro: CobroPorBoletear;
    emitidas: number[];
    aviso: string | null;
  };

/** Lo que se boletea suelto (D3): cabañas, ticket diario, tinaja… */
export interface ItemDelTarifario {
  id: number;
  nombre: string;
  /** Con IVA. */
  precio: number;
  unidad: string;
  activo: boolean;
  orden: number;
}

export interface LineaSuelta {
  tarifario_id?: number | null;
  cantidad?: number;
  /** Solo el administrador: una línea a mano. */
  descripcion?: string | null;
  monto?: number | null;
}

export const getTarifario = async (): Promise<ItemDelTarifario[]> =>
  ((await apiRequest(`${base}/tarifario`, "GET")) || []) as ItemDelTarifario[];

export const crearItemDelTarifario = async (item: {
  nombre: string;
  precio: number;
  unidad: string;
}): Promise<ItemDelTarifario[]> =>
  (await apiRequest(`${base}/tarifario`, "POST", item)) as ItemDelTarifario[];

export const editarItemDelTarifario = async (
  id: number,
  cambios: Partial<Omit<ItemDelTarifario, "id">>,
): Promise<ItemDelTarifario[]> =>
  (await apiRequest(
    `${base}/tarifario/${id}`,
    "PATCH",
    cambios,
  )) as ItemDelTarifario[];

export const borrarItemDelTarifario = async (
  id: number,
): Promise<ItemDelTarifario[]> =>
  (await apiRequest(`${base}/tarifario/${id}`, "DELETE")) as ItemDelTarifario[];

export const emitirBoletaSuelta = async (datos: {
  lineas: LineaSuelta[];
  cabana?: string | null;
  correo?: string | null;
}): Promise<{
  boleta: {
    id: number;
    folio: number | null;
    estado: string;
    total: number;
    pdf_path: string | null;
  } | null;
  aviso: string | null;
}> =>
  (await apiRequest(`${base}/sueltas`, "POST", datos)) as {
    boleta: {
      id: number;
      folio: number | null;
      estado: string;
      total: number;
      pdf_path: string | null;
    } | null;
    aviso: string | null;
  };
