import { apiRequest } from "./api";
import type { MedioDePago } from "../constants/facturacion";

/**
 * LA CAJA DE RECEPCIÓN (doc 19 §9.43, sprint 2). Quien opera la caja la
 * abre, anota los ingresos y retiros (§9.51) y la cierra a ciegas: lo que recibe nunca trae lo
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

/** §9.51: la plata que entra (la mandan el dueño o la administradora; no
 *  es venta) o sale de la caja durante el turno. */
export type TipoDeMovimiento = "ingreso" | "retiro" | "gasto";

export interface MovimientoDeCaja extends RetiroDeCaja {
  tipo: TipoDeMovimiento;
  /** Quién lo anotó; nulo en los de antes del 16-11. */
  creado_por_nombre: string | null;
}

export interface CajaAbierta {
  id: number;
  abierta_por_nombre: string;
  abierta_en: string;
  sencillo_inicial: number;
  /** §9.51: los ingresos y retiros, por hora. Opcional: el motor de antes
   *  solo manda `retiros`. */
  movimientos?: MovimientoDeCaja[];
  retiros: RetiroDeCaja[];
}

export interface EstadoDeLaCaja {
  abierta: CajaAbierta | null;
  /** §9.49: si el cierre pide contar las pulseras. Nunca cuántas debería
   *  tener: el cierre es ciego. */
  cuenta_pulseras?: boolean;
}

/** §9.53: la apertura contra el cierre anterior de la misma caja. Nula en
 *  el primer turno de la historia. Solo la ve quien revisa. */
export interface AperturaComparada {
  /** El efectivo que declaró el cierre anterior. */
  cierre_anterior: number;
  /** Sencillo inicial − cierre anterior: negativa falta, positiva sobra. */
  diferencia: number;
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
  /** §9.53: opcional, el motor de antes no la manda. */
  apertura?: AperturaComparada | null;
  /** §9.54, la cadena del efectivo, solo en efectivo: lo esperado, lo
   *  declarado y la diferencia; aparte, la diferencia sumada de débito,
   *  crédito y transferencia. Nulos con la caja abierta; opcionales, el
   *  motor de antes no los manda. */
  debia_tener?: number | null;
  cerro_con?: number | null;
  diferencia_efectivo?: number | null;
  diferencia_otros?: number | null;
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
  /** §9.49: nulo si ese cierre no contó las pulseras. */
  pulseras?: PulserasDelCierre | null;
  cuadre: {
    lineas: LineaDelCuadre[];
    vendido: number;
    /** §9.51: opcional, el motor de antes no lo manda. */
    ingresos?: number;
    retiros: number;
    /** §9.56: opcional, el motor de antes no lo manda. */
    gastos?: number;
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
  /** §9.51: opcional, el motor de antes solo manda `retiros`. */
  movimientos?: MovimientoDeCaja[];
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

/** §9.49: lo de las pulseras en un cierre (solo quien revisa). */
export interface PulserasDelCierre {
  deberian: number;
  contadas: number;
  diferencia: number;
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

/** §9.51: la plata que mandan el dueño o la administradora. */
export const anotarIngreso = async (datos: {
  monto: number;
  motivo: string;
}): Promise<EstadoDeLaCaja> =>
  (await apiRequest(`${base}/ingresos`, "POST", datos)) as EstadoDeLaCaja;

/** El cierre ciego: responde solo cuándo cerró. */
export const cerrarCaja = async (datos: {
  efectivo: number;
  debito: number;
  credito: number;
  transferencia: number;
  comentario?: string | null;
  /** §9.49: las pulseras que le quedan, si se cuentan. */
  pulseras?: number;
}): Promise<{ cerrada_en: string }> =>
  (await apiRequest(`${base}/cerrar`, "POST", datos)) as {
    cerrada_en: string;
  };

export const getCierres = async (): Promise<CierreEnLaLista[]> =>
  (await apiRequest(`${base}/cierres`, "GET")) as CierreEnLaLista[];

/** §9.55: lo que debería haber en la caja abierta, por medio de pago.
 *  Solo para quien revisa los cierres (la puerta pide ese permiso). */
export interface EsperadoDeLaCaja {
  abierta: {
    id: number;
    sencillo_inicial: number;
    ingresos: number;
    retiros: number;
    lineas: { medio: MedioDePago; vendido: number; esperado: number }[];
  } | null;
}

export const getEsperadoDeLaCaja = async (): Promise<EsperadoDeLaCaja> =>
  (await apiRequest(`${base}/esperado`, "GET")) as EsperadoDeLaCaja;

/** §9.56: un gasto (plata que sale para pagar algo, como un taxi). */
export const anotarGasto = async (datos: {
  monto: number;
  motivo: string;
}): Promise<EstadoDeLaCaja> =>
  (await apiRequest(`${base}/gastos`, "POST", datos)) as EstadoDeLaCaja;

/** §9.54: las tres cifras de los últimos 7 días corridos. */
export interface ResumenDeLaCadena {
  desde: string;
  /** La suma de las diferencias de efectivo de los cerrados (negativa
   *  falta, positiva sobra). */
  efectivo_que_falta: number;
  /** La suma de las aperturas con menos que el cierre anterior (≤ 0). */
  perdido_entre_turnos: number;
  por_revisar: number;
  /** §9.57: la suma de los gastos de caja de la misma ventana (con el turno
   *  abierto). Sin el dato (el motor de antes), la tarjeta no se muestra. */
  gastos?: number;
  /** §9.57: esos gastos, del más nuevo al más viejo. */
  lista_de_gastos?: GastoDeLaSemana[];
}

/** §9.57: un gasto de caja de los últimos 7 días. */
export interface GastoDeLaSemana {
  id: number;
  turno_id: number;
  monto: number;
  motivo: string;
  creado_por_nombre: string | null;
  creado_en: string;
}

export const getResumenDeCierres = async (): Promise<ResumenDeLaCadena> =>
  (await apiRequest(`${base}/cierres/resumen`, "GET")) as ResumenDeLaCadena;

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
