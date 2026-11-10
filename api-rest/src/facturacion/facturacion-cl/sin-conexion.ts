import { BadGatewayException } from '@nestjs/common';
import type {
  AmbienteDeFacturacion,
  FacturacionCl,
  RespuestaDeProcesar,
} from './facturacion-cl';

/**
 * LA CONEXIÓN QUE NO EMITE (doc 19 §9.18): producción sin las credenciales
 * de facturacion.cl, o credenciales en el motor que no es (las de
 * producción en el laboratorio). Nada sale, y cada intento dice por qué.
 * `procesar` responde «rechazado» en vez de lanzar: no se mandó nada, así
 * que no puede quedar un documento «por confirmar». Es un 502, como lo de
 * facturacion.cl en `soap.ts`: el 503 la vitrina lo avisa como la base.
 */
export class FacturacionClSinConexion implements FacturacionCl {
  constructor(
    readonly ambiente: AmbienteDeFacturacion,
    readonly sinConexion: string,
  ) {}

  enLinea(): Promise<boolean> {
    return Promise.resolve(false);
  }

  folios(): Promise<null> {
    return Promise.resolve(null);
  }

  folioSiguiente(): Promise<number> {
    return Promise.reject(new BadGatewayException(this.sinConexion));
  }

  procesar(_archivo: string, tipo: number): Promise<RespuestaDeProcesar> {
    return Promise.resolve({
      resultado: 'rechazado',
      tipo,
      folio: null,
      fecha: null,
      mensaje: this.sinConexion,
      urlOriginal: null,
      urlCedible: null,
      crudo: null,
    });
  }

  obtenerPdf(): Promise<Buffer | null> {
    return Promise.reject(new BadGatewayException(this.sinConexion));
  }

  obtenerXml(): Promise<{ base64: string | null; mensaje: string | null }> {
    return Promise.reject(new BadGatewayException(this.sinConexion));
  }
}
