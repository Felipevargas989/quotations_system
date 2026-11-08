import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { datosDelRecibido } from '../facturacion-cl/compras';
import { ConexionConFacturacionCl } from '../facturas/conexion';
import {
  RecibidosRepository,
  type RecibidoAGuardar,
} from './recibidos.repository';

/** «2026-11»: un mes que existe. */
export const esPeriodo = (texto: string) =>
  /^\d{4}-(0[1-9]|1[0-2])$/.test(texto);

/**
 * «RECIBIDOS» DE LA SECCIÓN FACTURACIÓN (doc 19 §9.25 y §9.28; Felipe,
 * 07-11: *"¿ya trajiste las facturas recibidas? ¿eso funcionará?"*). Las
 * facturas de los proveedores, mes a mes, desde el Libro de Compras de
 * facturacion.cl. La lista sale de la copia guardada; «Traer de
 * facturacion.cl» la pone al día. Solo lee: aceptar o rechazar (el acuse)
 * es el paso 3, con otro OK.
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
    const documentos = await this.repo.delPeriodo(companyId, periodo);
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
}
