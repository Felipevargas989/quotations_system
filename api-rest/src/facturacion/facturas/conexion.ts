import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { FacturacionClCompras } from '../facturacion-cl/compras';
import {
  configuracionDeFacturacionCl,
  describirConfiguracion,
} from '../facturacion-cl/configuracion';
import type {
  AmbienteDeFacturacion,
  FacturacionCl,
  FoliosDisponibles,
} from '../facturacion-cl/facturacion-cl';
import { FacturacionClSimulado } from '../facturacion-cl/simulado';
import { FacturacionClSinConexion } from '../facturacion-cl/sin-conexion';
import {
  FacturacionClSoap,
  pulsoDeFacturacionCl,
} from '../facturacion-cl/soap';
import { DocumentosTributariosRepository } from './documentos-tributarios.repository';

/** Los tipos que se emiten desde Eventia, en el orden de la pantalla. */
const TIPOS = [33, 61, 56, 39];

/**
 * LA CONEXIÓN CON FACTURACION.CL DE CADA EMPRESA (doc 19 §5.3 y §9.18)
 *
 * Cuál es la decide `configuracionDeFacturacionCl` con las variables de
 * Railway:
 * - con las credenciales, la de verdad (SOAP), SOLO para la empresa dueña
 *   de esas credenciales;
 * - sin credenciales, en el laboratorio, la simulada de los pasos 1 a 4:
 *   sigue la numeración de la base (el último folio de cada tipo en el
 *   ambiente 'simulado'), así que un reinicio no repite folios;
 * - en producción sin credenciales, o con las del ambiente que no es, la
 *   que no emite y dice por qué.
 *
 * Un documento se comprueba y su PDF se pide en el ambiente que lo emitió
 * (`de(empresa, ambiente)`): un folio simulado no es un folio de prueba.
 */
@Injectable()
export class ConexionConFacturacionCl {
  private readonly config = configuracionDeFacturacionCl(process.env);
  private readonly simuladas = new Map<number, FacturacionCl>();
  private real: FacturacionClSoap | null = null;
  private libro: FacturacionClCompras | null = null;

  constructor(
    private readonly repo: DocumentosTributariosRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(ConexionConFacturacionCl.name);
    this.logger.info(`facturacion.cl: ${describirConfiguracion(this.config)}`);
  }

  /** La conexión con que se emite hoy. Con `ambiente`, la de ese ambiente
   *  (para lo ya emitido), o null si ya no está a mano. */
  de(companyId: number): FacturacionCl;
  de(companyId: number, ambiente: AmbienteDeFacturacion): FacturacionCl | null;
  de(companyId: number, ambiente?: AmbienteDeFacturacion) {
    const actual = this.actual(companyId);
    if (!ambiente || actual.ambiente === ambiente) return actual;
    return ambiente === 'simulado' && !this.config.enProduccion
      ? this.simulada(companyId)
      : null;
  }

  /**
   * «Probar la conexión» (paso 0): si facturacion.cl responde desde este
   * motor (sin credenciales) y, conectado, los folios que quedan de cada
   * tipo. No emite nada.
   */
  async probar(companyId: number) {
    const conexion = this.actual(companyId);
    const { ambiente, sinConexion } = conexion;
    const servicio = await pulsoDeFacturacionCl();
    const folios: (
      | (FoliosDisponibles & { ms: number })
      | { tipo: number; ms: number; error: string }
    )[] = [];
    if (conexion instanceof FacturacionClSoap)
      for (const tipo of TIPOS) {
        const inicio = Date.now();
        try {
          const {
            folios: f,
            mensaje,
            rangos,
          } = await conexion.foliosYLoQueDijo(tipo);
          // Los rangos tal como los lista facturacion.cl (paso 0, 06-11):
          // son números de folio y fechas, nunca las credenciales.
          this.logger.info(
            `facturacion.cl: rangos del tipo ${tipo}: ${JSON.stringify(rangos)}`,
          );
          folios.push(
            f
              ? { ...f, ms: Date.now() - inicio }
              : {
                  tipo,
                  ms: Date.now() - inicio,
                  error: mensaje ? `sin folios («${mensaje}»)` : 'sin folios',
                },
          );
        } catch (error) {
          folios.push({
            tipo,
            ms: Date.now() - inicio,
            error: mensajeDe(error),
          });
        }
      }
    return {
      ambiente,
      sin_conexion: sinConexion ?? null,
      servicio,
      folios,
    };
  }

  /**
   * El Libro de Compras de la empresa (§9.28): lo recibido de los
   * proveedores. Solo con la conexión de verdad (las mismas credenciales);
   * si no, el porqué. Solo lee.
   */
  compras(companyId: number): {
    ambiente: AmbienteDeFacturacion;
    libro: FacturacionClCompras | null;
    motivo: string | null;
  } {
    const c = this.config;
    if (c.modo === 'conectado' && c.empresa === companyId)
      return {
        ambiente: c.ambiente,
        libro: (this.libro ??= new FacturacionClCompras({
          credenciales: c.credenciales,
        })),
        motivo: null,
      };
    const actual = this.actual(companyId);
    return {
      ambiente: actual.ambiente,
      libro: null,
      motivo:
        actual.sinConexion ??
        'Sin las credenciales de facturacion.cl no se puede pedir lo recibido',
    };
  }

  private actual(companyId: number): FacturacionCl {
    const c = this.config;
    if (c.modo === 'conectado' && c.empresa === companyId)
      return (this.real ??= new FacturacionClSoap({
        ambiente: c.ambiente,
        credenciales: c.credenciales,
      }));
    if (c.modo === 'sin_conexion' && (c.empresa ?? companyId) === companyId)
      return new FacturacionClSinConexion(c.ambiente, c.motivo);
    if (c.enProduccion)
      return new FacturacionClSinConexion(
        'produccion',
        'Esta empresa no tiene conexión con facturacion.cl',
      );
    return this.simulada(companyId);
  }

  private simulada(companyId: number): FacturacionCl {
    let conexion = this.simuladas.get(companyId);
    if (!conexion) {
      conexion = new FacturacionClSimulado({
        ultimoFolio: (tipo) =>
          this.repo.ultimoFolio(companyId, 'simulado', tipo),
      });
      this.simuladas.set(companyId, conexion);
    }
    return conexion;
  }
}
