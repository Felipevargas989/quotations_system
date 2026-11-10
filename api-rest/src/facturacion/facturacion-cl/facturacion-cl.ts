/**
 * LA CONEXIÓN CON FACTURACION.CL (doc 19 §2, §5.3, §9.10 y §9.18)
 *
 * Eventia le habla a facturacion.cl solo por esta interfaz. Hay tres
 * implementaciones:
 * - la SIMULADA (`FacturacionClSimulado`, pasos 1 a 4 del doc 19): responde
 *   como dice el manual y no emite nada. Solo fuera de producción;
 * - la de verdad (`FacturacionClSoap`, paso 5), por el servicio SOAP
 *   `wsplano.asmx`, con las credenciales que carga Felipe en Railway;
 * - la que NO emite (`FacturacionClSinConexion`): producción sin sus
 *   credenciales, o credenciales en el ambiente equivocado. Dice por qué.
 *
 * Las reglas valen para las dos:
 * - un documento por llamada (L14);
 * - `procesar` nunca reintenta solo: si se corta, lanza `EnvioSinRespuesta`
 *   y el documento queda «por confirmar» (L5);
 * - Eventia guarda lo que responde facturacion.cl y nada más: no le
 *   pregunta al SII (D9).
 */

export type AmbienteDeFacturacion = 'simulado' | 'prueba' | 'produccion';

/** Lo que la nota de BelIA en la bitácora agrega según dónde salió. */
export const NOTA_DEL_AMBIENTE: Partial<Record<AmbienteDeFacturacion, string>> =
  {
    simulado: ' Es simulada: no salió nada al SII.',
    prueba:
      ' Es de prueba (el ambiente de pruebas de facturacion.cl): no vale ante el SII.',
  };

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

/** Los folios que le quedan a un tipo (`ConsultarCAF`). */
export interface FoliosDisponibles {
  tipo: number;
  siguiente: number;
  /** El último folio del rango que se está usando. */
  hasta: number;
  /** Cuántos quedan, contando los rangos que siguen. */
  libres: number;
  /** El vencimiento del rango, tal como lo dice facturacion.cl. */
  vence: string | null;
}

export interface FacturacionCl {
  readonly ambiente: AmbienteDeFacturacion;
  /** Por qué no se puede emitir, si no se puede (la pantalla lo dice). */
  readonly sinConexion?: string;
  /** ¿Está arriba? (`Online`). */
  enLinea(): Promise<boolean>;
  /** El folio siguiente de un tipo (`ConsultarCAF`), para la factura y las
   *  notas (L2). La boleta va con folio 0. `descartados`: folios que
   *  facturacion.cl ya rechazó «fuera del rango que tiene autorizado»; se
   *  toma el de otro rango (paso 0, 06-11). */
  folioSiguiente(tipo: number, descartados?: number[]): Promise<number>;
  /** Los folios que quedan de un tipo. null si no hay (o en el simulado,
   *  que no los tiene). */
  folios(tipo: number): Promise<FoliosDisponibles | null>;
  /** Manda UN documento (`Procesar`). Nunca reintenta. */
  procesar(archivo: string, tipo: number): Promise<RespuestaDeProcesar>;
  /** El PDF de un documento emitido (`ObtenerPdf`), para guardar la copia
   *  propia (L10). null si todavía no está. */
  obtenerPdf(tipo: number, folio: number): Promise<Buffer | null>;
  /** §9.33: el XML tributario de un documento emitido (`getXMLDte`, un
   *  método con costo adicional de facturacion.cl), solo cuando se pide.
   *  Viene en Base64 tal cual (ISO-8859-1); si no, lo que dijo. */
  obtenerXml(
    tipo: number,
    folio: number,
  ): Promise<{ base64: string | null; mensaje: string | null }>;
}

/** La llave con que Nest entrega la implementación que corresponda. */
export const FACTURACION_CL = Symbol('FACTURACION_CL');
