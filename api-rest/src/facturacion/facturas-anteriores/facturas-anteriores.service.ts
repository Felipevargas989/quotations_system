import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { FacturacionCl } from '../facturacion-cl/facturacion-cl';
import { ConexionConFacturacionCl } from '../facturas/conexion';
import { DocumentosTributariosRepository } from '../facturas/documentos-tributarios.repository';
import {
  FacturasAnterioresRepository,
  type ReceptorGuardado,
} from './facturas-anteriores.repository';
import { leerFacturaAnterior } from './texto-del-pdf';

/** Solo las facturas (33): son las que llevan el cuadro del cliente. */
const FACTURA = 33;
/** Una lectura pide a lo más esto (las más nuevas). */
export const MAXIMO_DE_FOLIOS = 1000;
/** Cada cuántas facturas se anota el avance. */
const AVISO = 10;
/** Tantas sin respuesta seguidas cortan la lectura. */
const SIN_RESPUESTA_SEGUIDAS = 5;
/** Una lectura que lleva más que esto «leyendo» se dio por caída. */
const LECTURA_CAIDA_MS = 3 * 60 * 60_000;

/**
 * «LEER MIS FACTURAS ANTERIORES» (doc 19 §9.29; Felipe, 08-11: *"¿qué pasó
 * con buscar los datos solo con el RUT?"*). La segunda fuente del RUT que
 * llena todo (§9.25, paso 2): las facturas que la empresa ya emitió en
 * facturacion.cl, bajadas UNA vez con `ObtenerPdf` (viene incluido) y
 * leídas sin IA (`texto-del-pdf.ts`).
 *
 * Por detrás, de la más nueva a la más vieja, una a la vez: así cada RUT
 * queda con lo de su factura más nueva. Solo lee: no emite ni cambia nada
 * en facturacion.cl. En el ambiente de prueba la empresa es compartida con
 * otros integradores: ahí solo se leen las facturas que emitió Eventia.
 */
@Injectable()
export class FacturasAnterioresService {
  /** Se cambia en las pruebas. */
  pausaMs = 300;
  private readonly leyendo = new Set<number>();

  constructor(
    private readonly repo: FacturasAnterioresRepository,
    private readonly conexion: ConexionConFacturacionCl,
    private readonly documentos: DocumentosTributariosRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(FacturasAnterioresService.name);
  }

  /** La última lectura, cuántos clientes hay y si se puede leer. */
  async estado(companyId: number) {
    const [ultima, clientes] = await Promise.all([
      this.repo.ultima(companyId),
      this.repo.cuantosClientes(companyId),
    ]);
    const conexion = this.conexion.de(companyId);
    return {
      ultima,
      clientes,
      se_puede_leer: this.esDeVerdad(conexion),
      sin_conexion: this.esDeVerdad(conexion)
        ? null
        : (conexion.sinConexion ??
          'Con facturacion.cl simulado no hay facturas anteriores que leer'),
    };
  }

  /** Empieza una lectura por detrás y la devuelve. */
  async leer(
    companyId: number,
    por: { id: string | null; nombre: string | null },
  ) {
    const ultima = await this.repo.ultima(companyId);
    if (
      this.leyendo.has(companyId) ||
      (ultima?.estado === 'leyendo' &&
        Date.now() - Date.parse(ultima.empezo_en) < LECTURA_CAIDA_MS)
    )
      throw new ConflictException(
        'Ya se están leyendo las facturas anteriores.',
      );
    const conexion = this.conexion.de(companyId);
    if (!this.esDeVerdad(conexion))
      throw new BadRequestException(
        conexion.sinConexion ??
          'Con facturacion.cl simulado no hay facturas anteriores que leer',
      );
    const folios = await this.foliosALeer(companyId, conexion);
    if (!folios.length)
      throw new BadRequestException(
        'facturacion.cl no tiene facturas anteriores que leer',
      );
    const lectura = await this.repo.empezar(companyId, por, folios);
    this.leyendo.add(companyId);
    void this.correr(companyId, lectura.id, conexion, folios).finally(() =>
      this.leyendo.delete(companyId),
    );
    return lectura;
  }

  /** El cliente de ese RUT canónico en las facturas anteriores, o nulo. */
  async buscar(
    companyId: number,
    rut: string,
  ): Promise<ReceptorGuardado | null> {
    return this.repo.receptor(companyId, rut);
  }

  /** La lectura entera; nunca falla hacia afuera. */
  async correr(
    companyId: number,
    lecturaId: number,
    conexion: FacturacionCl,
    folios: number[],
  ): Promise<void> {
    const vistos = new Set<string>();
    let leidas = 0;
    let encontradas = 0;
    let sinRespuesta = 0;
    const cuenta = () => ({ leidas, encontradas, clientes: vistos.size });
    try {
      for (const folio of folios) {
        let pdf: Buffer | null;
        try {
          pdf = await conexion.obtenerPdf(FACTURA, folio);
          sinRespuesta = 0;
        } catch (error) {
          if (++sinRespuesta >= SIN_RESPUESTA_SEGUIDAS)
            throw new Error(
              `facturacion.cl dejó de responder en la factura N° ${folio}: ${mensajeDe(error)}`,
            );
          continue;
        }
        leidas++;
        if (pdf) {
          encontradas++;
          const receptor = leerFacturaAnterior(pdf);
          // La primera vez que aparece un RUT es su factura más nueva.
          if (receptor && !vistos.has(receptor.rut)) {
            vistos.add(receptor.rut);
            await this.repo.guardar(companyId, {
              ...receptor,
              tipo: FACTURA,
              folio,
            });
          }
        }
        if (leidas % AVISO === 0)
          await this.repo.avanzar(companyId, lecturaId, cuenta());
        if (this.pausaMs) await new Promise((r) => setTimeout(r, this.pausaMs));
      }
      await this.repo.terminar(companyId, lecturaId, cuenta());
      this.logger.info(
        `facturas anteriores de la empresa ${companyId}: ${leidas} pedidas, ${encontradas} con PDF, ${vistos.size} clientes`,
      );
    } catch (error) {
      const motivo = mensajeDe(error);
      this.logger.error(`facturas anteriores: ${motivo}`);
      await this.repo
        .terminar(companyId, lecturaId, cuenta(), motivo)
        .catch(() => undefined);
    }
  }

  /** De verdad: las de prueba o las de producción, no la simulada. */
  private esDeVerdad(conexion: FacturacionCl) {
    return !conexion.sinConexion && conexion.ambiente !== 'simulado';
  }

  /**
   * Las facturas por pedir, de la más nueva a la más vieja. En producción,
   * de la anterior a la siguiente que dice facturacion.cl (o a la última
   * que emitió Eventia) hacia atrás; en prueba, solo las de Eventia.
   */
  private async foliosALeer(
    companyId: number,
    conexion: FacturacionCl,
  ): Promise<number[]> {
    if (conexion.ambiente === 'prueba')
      return this.repo.foliosDeEventia(companyId, 'prueba', FACTURA);
    const disponibles = await conexion.folios(FACTURA).catch(() => null);
    const hasta = disponibles
      ? disponibles.siguiente - 1
      : await this.documentos.ultimoFolio(
          companyId,
          conexion.ambiente,
          FACTURA,
        );
    const folios: number[] = [];
    for (let f = hasta; f >= 1 && folios.length < MAXIMO_DE_FOLIOS; f--)
      folios.push(f);
    return folios;
  }
}
