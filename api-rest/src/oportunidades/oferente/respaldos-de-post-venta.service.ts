import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { extensionDe } from '../adjuntos/adjuntos.service';
import { hoyEnChile } from '../analisis/comun';
import {
  type DocumentosDeUnEvento,
  EventiaRepository,
} from '../eventia/eventia.repository';
import { LeerRespaldoService } from './leer-respaldo.service';
import { OferenteRepository } from './oferente.repository';
import type { DatosDeRespaldo } from './respaldo';
import {
  ANIOS_DE_EXPERIENCIA,
  archivoDeLaRuta,
  documentosParaLeer,
  MAX_EVENTOS_POR_VEZ,
  mismoNumero,
  nombreDelRespaldo,
  type RespaldoDePostVenta,
  yaEsta,
} from './respaldos-de-post-venta';

// Al «Armar postulación», antes de los anexos (decisión 45, 19-10): las
// facturas y órdenes de compra de los eventos hechos que todavía no están
// en «Mi empresa», leídas con la misma IA de «Leer solo». No se guarda
// nada aquí: los anexos las anotan en su trabajo. Las reglas, en
// respaldos-de-post-venta.ts.

/** Cuántos se leen a la vez (Haiku y la ficha de Mercado Público). */
const DE_A = 3;

@Injectable()
export class RespaldosDePostVentaService {
  constructor(
    private readonly eventia: EventiaRepository,
    private readonly repo: OferenteRepository,
    private readonly lector: LeerRespaldoService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RespaldosDePostVentaService.name);
  }

  /** Los de los últimos años, del evento más nuevo al más viejo, sin
   *  repetir ni un evento ni un número que ya esté en «Mi empresa». Nunca
   *  falla por un evento: el que no se puede leer, no va. */
  async paraLaPostulacion(companyId: number): Promise<RespaldoDePostVenta[]> {
    const hoy = hoyEnChile();
    const desde = `${Number(hoy.slice(0, 4)) - ANIOS_DE_EXPERIENCIA}${hoy.slice(4)}`;
    const [eventos, carpeta] = await Promise.all([
      this.eventia.documentosDeExperiencia(companyId, hoy),
      this.repo.respaldos(companyId),
    ]);
    const conocidos: Array<Pick<DatosDeRespaldo, 'numero'>> = [...carpeta];
    const pendientes = eventos
      .filter((e) => (e.fecha ?? '') >= desde && !yaEsta(e, carpeta))
      .slice(0, MAX_EVENTOS_POR_VEZ);
    const leidos: RespaldoDePostVenta[] = [];
    for (let i = 0; i < pendientes.length; i += DE_A) {
      await Promise.all(
        pendientes
          .slice(i, i + DE_A)
          .map((e) => this.leerUno(companyId, e, conocidos, leidos)),
      );
    }
    this.logger.info(
      `respaldos de Post-venta (empresa ${companyId}): ${leidos.length} de ${pendientes.length} eventos por revisar`,
    );
    // En el orden de los eventos: los más nuevos primero.
    const orden = new Map(eventos.map((e, i) => [e.numero, i]));
    return leidos.sort(
      (a, b) => (orden.get(a.evento) ?? 0) - (orden.get(b.evento) ?? 0),
    );
  }

  /** Prueba sus documentos en orden hasta dar con una orden de compra o una
   *  factura de la empresa que no esté ya. */
  private async leerUno(
    companyId: number,
    e: DocumentosDeUnEvento,
    conocidos: Array<Pick<DatosDeRespaldo, 'numero'>>,
    leidos: RespaldoDePostVenta[],
  ): Promise<void> {
    for (const doc of documentosParaLeer(e)) {
      try {
        const buffer = await this.eventia.descargarDocumento(
          companyId,
          doc.ruta,
        );
        const leido = await this.lector.leer(companyId, {
          originalname: archivoDeLaRuta(doc.ruta),
          buffer,
          size: buffer.length,
        });
        // Con la ficha de Mercado Público, el único aviso es que la orden
        // es de otro proveedor: esa no es experiencia de la empresa.
        if (
          leido.tipo === 'otro' ||
          (leido.datos.fuente === 'mercado_publico' && leido.aviso)
        ) {
          continue;
        }
        // Mirar y anotar sin esperar nada entre medio: otro evento con el
        // mismo número ya lo ve.
        if (conocidos.some((c) => mismoNumero(c.numero, leido.datos.numero))) {
          return;
        }
        conocidos.push(leido.datos);
        leidos.push({
          ...leido.datos,
          evento: e.numero,
          archivo: nombreDelRespaldo(
            leido.tipo,
            leido.datos.numero,
            extensionDe(doc.ruta),
          ),
          ruta: doc.ruta,
          bytes: buffer.length,
        });
        return;
      } catch (error) {
        this.logger.warn(
          `respaldo del evento ${e.numero} (empresa ${companyId}), «${doc.nombre}»: ${mensajeDe(error)}`,
        );
      }
    }
  }
}
