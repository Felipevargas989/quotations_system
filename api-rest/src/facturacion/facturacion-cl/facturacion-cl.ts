/**
 * LA CONEXIÓN CON FACTURACION.CL (doc 19 §2, §5.3 y §9.10)
 *
 * Eventia le habla a facturacion.cl solo por esta interfaz. Hay dos
 * implementaciones:
 * - la SIMULADA (`FacturacionClSimulado`, pasos 1 a 4 del doc 19): responde
 *   como dice el manual y no emite nada;
 * - la de verdad, por el servicio SOAP `wsplano.asmx` (paso 5), con las
 *   credenciales que carga Felipe en Railway.
 *
 * Las reglas valen para las dos:
 * - un documento por llamada (L14);
 * - `procesar` nunca reintenta solo: si se corta, lanza `EnvioSinRespuesta`
 *   y el documento queda «por confirmar» (L5);
 * - Eventia guarda lo que responde facturacion.cl y nada más: no le
 *   pregunta al SII (D9).
 */

export type AmbienteDeFacturacion = 'simulado' | 'prueba' | 'produccion';

/** Lo que responde facturacion.cl a `Procesar`. */
export interface RespuestaDeProcesar {
  /** emitido: lo generó con su folio. rechazado: dijo que no; se corrige y
   *  se manda de nuevo. */
  resultado: 'emitido' | 'rechazado';
  tipo: number;
  folio: number | null;
  fecha: string | null;
  /** Lo que dijo facturacion.cl, tal cual. */
  mensaje: string;
  /** Enlaces públicos del PDF (L10): no se reparten. */
  urlOriginal: string | null;
  urlCedible: string | null;
  /** La respuesta completa, para la auditoría
   *  (`documentos_tributarios.respuesta`). */
  crudo: unknown;
}

/** Se cortó sin saber si el documento quedó emitido (L5). */
export class EnvioSinRespuesta extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'EnvioSinRespuesta';
  }
}

export interface FacturacionCl {
  readonly ambiente: AmbienteDeFacturacion;
  /** ¿Está arriba? (`Online`). */
  enLinea(): Promise<boolean>;
  /** El folio siguiente de un tipo (`ConsultarCAF`), para la factura y las
   *  notas (L2). La boleta va con folio 0. */
  folioSiguiente(tipo: number): Promise<number>;
  /** Manda UN documento (`Procesar`). Nunca reintenta. */
  procesar(archivo: string, tipo: number): Promise<RespuestaDeProcesar>;
  /** El PDF de un documento emitido (`ObtenerPdf`), para guardar la copia
   *  propia (L10). null si todavía no está. */
  obtenerPdf(tipo: number, folio: number): Promise<Buffer | null>;
}

/** La llave con que Nest entrega la implementación que corresponda. */
export const FACTURACION_CL = Symbol('FACTURACION_CL');
