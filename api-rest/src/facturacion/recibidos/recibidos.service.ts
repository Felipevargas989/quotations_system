import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { datosDelRecibido } from '../facturacion-cl/compras';
import type { PendienteDelPanel } from '../facturacion-cl/panel';
import { ConexionConFacturacionCl } from '../facturas/conexion';
import {
  RecibidosRepository,
  type AcuseDeRecibido,
  type RecibidoAGuardar,
} from './recibidos.repository';

/** «2026-11»: un mes que existe. */
export const esPeriodo = (texto: string) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(texto);

/** La ley 19.983 da 8 días corridos desde la recepción para reclamar una
 *  factura; después queda aceptada. */
export const DIAS_PARA_RECLAMAR = 8;

/** Hoy en Chile, «AAAA-MM-DD». */
export const hoyEnChile = (ahora = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(
    ahora,
  );

/**
 * Hasta cuándo se puede reclamar y cuántos días quedan, desde la recepción
 * en el SII («2026-11-03 10:15:00» del libro o «2026-11-03T13:15:00Z» del
 * panel). Sin la recepción, nulo: no se sabe.
 */
export const plazoParaReclamar = (
  recepcionSii: string | null,
  hoy: string,
): { vence: string; quedan: number } | null => {
  const dia = /^(\d{4}-\d{2}-\d{2})/.exec(recepcionSii ?? '')?.[1];
  if (!dia) return null;
  const vence = new Date(`${dia}T00:00:00Z`);
  vence.setUTCDate(vence.getUTCDate() + DIAS_PARA_RECLAMAR);
  const v = vence.toISOString().slice(0, 10);
  const quedan = Math.round(
    (Date.parse(`${v}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) /
      86_400_000,
  );
  return { vence: v, quedan };
};

/** El último acuse que salió de ese documento, o nulo. */
const acuseDe = (
  acuses: AcuseDeRecibido[],
  d: { rut_emisor: string; tipo: number; folio: number },
) =>
  acuses.find(
    (a) =>
      a.resultado &&
      a.rut_emisor === d.rut_emisor &&
      a.tipo === d.tipo &&
      a.folio === d.folio,
  ) ?? null;

/**
 * «RECIBIDOS» DE LA SECCIÓN FACTURACIÓN (doc 19 §9.25 y §9.28; Felipe,
 * 07-11: *"¿ya trajiste las facturas recibidas? ¿eso funcionará?"*). Las
 * facturas de los proveedores, mes a mes, desde el Libro de Compras de
 * facturacion.cl. La lista sale de la copia guardada; «Traer de
 * facturacion.cl» la pone al día. Desde el 08-11 (§9.30), el paso 3: lo
 * pendiente de acuse en el Panel DTE Recibidos y «Aceptar» o «Reclamar»
 * (solo el administrador, dentro de los 8 días de la ley), cada vez
 * anotado con quién y cuándo.
 */
@Injectable()
export class RecibidosService {
  constructor(
    private readonly repo: RecibidosRepository,
    private readonly conexion: ConexionConFacturacionCl,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RecibidosService.name);
  }

  /** Lo guardado del mes, y si se puede traer más. */
  async delMes(companyId: number, periodo: string) {
    if (!esPeriodo(periodo))
      throw new BadRequestException('El mes va como AAAA-MM');
    const { ambiente, libro, motivo } = this.conexion.compras(companyId);
    const guardados = await this.repo.delPeriodo(companyId, periodo);
    const acuses = await this.repo.acusesDe(
      companyId,
      guardados.map((d) => d.rut_emisor),
    );
    const hoy = hoyEnChile();
    // Cada uno con su acuse desde Eventia (§9.30) y su plazo para reclamar.
    const documentos = guardados.map((d) => {
      const a = acuseDe(acuses, d);
      return {
        ...d,
        acuse_eventia: a
          ? {
              accion: a.accion,
              pedido_por_nombre: a.pedido_por_nombre,
              pedido_en: a.pedido_en,
            }
          : null,
        plazo_para_reclamar:
          d.tipo === 33 || d.tipo === 34
            ? plazoParaReclamar(d.recepcion_sii, hoy)
            : null,
      };
    });
    const traido = documentos.reduce<string | null>(
      (m, d) => (!m || d.traido_en > m ? d.traido_en : m),
      null,
    );
    return {
      periodo,
      ambiente,
      se_puede_traer: !!libro,
      sin_conexion: libro ? null : motivo,
      traido_en: traido,
      documentos,
    };
  }

  /** «Traer de facturacion.cl»: pide el mes y guarda lo que trae. */
  async traer(companyId: number, periodo: string) {
    if (!esPeriodo(periodo))
      throw new BadRequestException('El mes va como AAAA-MM');
    const { libro, motivo } = this.conexion.compras(companyId);
    if (!libro) throw new BadRequestException(motivo);
    let respuesta: Awaited<ReturnType<typeof libro.obtenerCompra>>;
    try {
      respuesta = await libro.obtenerCompra(periodo);
    } catch (error) {
      throw new BadRequestException(mensajeDe(error));
    }
    if (!respuesta.ok && !respuesta.documentos.length)
      throw new BadRequestException(
        respuesta.mensaje
          ? `facturacion.cl dice: «${respuesta.mensaje}»`
          : 'facturacion.cl no entregó el libro de compras',
      );
    const aGuardar: RecibidoAGuardar[] = [];
    let sinDatos = 0;
    for (const d of respuesta.documentos) {
      const datos = d.xml ? datosDelRecibido(d.xml) : null;
      if (!datos) {
        sinDatos++;
        continue;
      }
      aGuardar.push({
        ...datos,
        link_pdf: d.linkPdf,
        recepcion_sii: d.recepcionSii,
        acuse_sii: d.acuseSii,
        tipo_compra: d.tipoCompra,
      });
    }
    await this.repo.guardar(companyId, periodo, aGuardar);
    this.logger.info(
      `libro de compras ${periodo}: ${aGuardar.length} guardados, ${sinDatos} sin XML`,
    );
    return {
      ...(await this.delMes(companyId, periodo)),
      traidos: aGuardar.length,
      sin_datos: sinDatos,
      mensaje: respuesta.mensaje,
    };
  }
  /** Lo pendiente de acuse en el Panel DTE Recibidos. Solo lee; si
   *  facturacion.cl dice que no, se muestra lo que dice. */
  async pendientes(companyId: number): Promise<{
    se_puede: boolean;
    sin_conexion: string | null;
    ok: boolean;
    mensaje: string | null;
    pendientes: PendienteDelPanel[];
  }> {
    const { panel, motivo } = this.conexion.panel(companyId);
    if (!panel)
      return {
        se_puede: false,
        sin_conexion: motivo,
        ok: false,
        mensaje: null,
        pendientes: [],
      };
    try {
      return {
        se_puede: true,
        sin_conexion: null,
        ...(await panel.pendientes()),
      };
    } catch (error) {
      return {
        se_puede: true,
        sin_conexion: null,
        ok: false,
        mensaje: mensajeDe(error),
        pendientes: [],
      };
    }
  }

  /**
   * «Aceptar» o «Reclamar» un documento recibido ante el SII, por el panel
   * (`Acuse`). Tiene efecto legal: lo pide el administrador con su
   * confirmación, una sola vez por documento, y reclamar solo dentro de los
   * 8 días. Haya salido o no, queda anotado.
   */
  async acuse(
    companyId: number,
    pedido: {
      rut_emisor: string;
      tipo: number;
      folio: number;
      accion: 'aceptar' | 'reclamar';
    },
    por: { id: string | null; nombre: string | null },
  ) {
    const { panel, motivo } = this.conexion.panel(companyId);
    if (!panel) throw new BadRequestException(motivo);
    const clave = {
      rut_emisor: pedido.rut_emisor.replace(/[.\s]/g, '').toUpperCase(),
      tipo: pedido.tipo,
      folio: pedido.folio,
    };
    const documento = await this.repo.documento(companyId, clave);
    if (!documento)
      throw new NotFoundException(
        'Ese documento no está en lo recibido de la empresa',
      );
    const previo = acuseDe(
      await this.repo.acusesDe(companyId, [clave.rut_emisor]),
      clave,
    );
    if (previo)
      throw new ConflictException(
        `Ya se ${previo.accion === 'aceptar' ? 'aceptó' : 'reclamó'} desde Eventia${previo.pedido_por_nombre ? ` (${previo.pedido_por_nombre})` : ''}`,
      );
    if (pedido.accion === 'reclamar') {
      const plazo = plazoParaReclamar(documento.recepcion_sii, hoyEnChile());
      if (plazo && plazo.quedan < 0)
        throw new BadRequestException(
          `Ya pasaron los ${DIAS_PARA_RECLAMAR} días para reclamarla (vencieron el ${plazo.vence}): la ley la da por aceptada`,
        );
    }
    let resultado = false;
    let mensaje: string | null = null;
    try {
      resultado = await panel.acuse(clave, pedido.accion);
      if (!resultado) mensaje = 'facturacion.cl respondió que no';
    } catch (error) {
      mensaje = mensajeDe(error);
    }
    await this.repo.anotarAcuse(
      companyId,
      { ...clave, accion: pedido.accion, resultado, mensaje },
      por,
    );
    this.logger.info(
      `acuse «${pedido.accion}» del ${clave.tipo} N° ${clave.folio} de ${clave.rut_emisor}: ${resultado ? 'salió' : `no salió (${mensaje})`}`,
    );
    if (!resultado)
      throw new BadRequestException(
        `No se pudo ${pedido.accion} en facturacion.cl: ${mensaje}`,
      );
    return { ok: true, accion: pedido.accion };
  }
}
