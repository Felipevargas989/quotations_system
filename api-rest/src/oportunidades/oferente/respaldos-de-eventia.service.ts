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
import { OferenteService } from './oferente.service';
import { type DatosDeRespaldo, soloLosDatos, TIPO_RESPALDO } from './respaldo';
import {
  archivoDeLaRuta,
  elegirDocumento,
  MAX_EVENTOS_POR_VEZ,
  mismoNumero,
  nombreDelRespaldo,
  type ResultadoDeTraer,
  yaEsta,
} from './respaldos-de-eventia';

// «Traer de Eventia» (decisión 45, 19-10): las facturas y órdenes de compra
// de los eventos hechos pasan a «Mi empresa» como respaldos de experiencia.
// Lo pide la empresa con un botón, y «Armar postulación» lo hace solo antes
// de los anexos. Las reglas, en respaldos-de-eventia.ts.

/** Cuántos se leen a la vez (Haiku y la ficha de Mercado Público). */
const DE_A = 3;

type Conocido = DatosDeRespaldo & { id?: number };

@Injectable()
export class RespaldosDeEventiaService {
  constructor(
    private readonly eventia: EventiaRepository,
    private readonly repo: OferenteRepository,
    private readonly oferente: OferenteService,
    private readonly lector: LeerRespaldoService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RespaldosDeEventiaService.name);
  }

  /** Trae los que faltan. Nunca repite: ni el mismo evento ni el mismo
   *  número de orden o de factura. */
  async traer(companyId: number, cuentaId: string): Promise<ResultadoDeTraer> {
    const [eventos, respaldos] = await Promise.all([
      this.eventia.documentosDeExperiencia(companyId, hoyEnChile()),
      this.repo.respaldos(companyId),
    ]);
    const conocidos: Conocido[] = [...respaldos];
    const pendientes = eventos.filter((e) => !yaEsta(e, conocidos));
    const resultado: ResultadoDeTraer = {
      traidos: 0,
      ya_estaban: eventos.length - pendientes.length,
      sin_traer: [],
    };
    const tanda = pendientes.slice(0, MAX_EVENTOS_POR_VEZ);
    for (let i = 0; i < tanda.length; i += DE_A) {
      await Promise.all(
        tanda
          .slice(i, i + DE_A)
          .map((e) =>
            this.traerUno(companyId, cuentaId, e, conocidos, resultado),
          ),
      );
    }
    if (pendientes.length > tanda.length) {
      resultado.sin_traer.push(
        `Quedan ${pendientes.length - tanda.length} eventos: vuelve a traer para seguir.`,
      );
    }
    this.logger.info(
      `respaldos de Eventia (empresa ${companyId}): ${resultado.traidos} traídos, ${resultado.ya_estaban} ya estaban, ${resultado.sin_traer.length} sin traer`,
    );
    return resultado;
  }

  private async traerUno(
    companyId: number,
    cuentaId: string,
    e: DocumentosDeUnEvento,
    conocidos: Conocido[],
    resultado: ResultadoDeTraer,
  ): Promise<void> {
    const cual = `Evento N° ${e.numero}${e.cliente ? ` (${e.cliente})` : ''}`;
    const doc = elegirDocumento(e);
    if (!doc) {
      resultado.sin_traer.push(`${cual}: su factura no es PDF ni foto.`);
      return;
    }
    try {
      const buffer = await this.eventia.descargarDocumento(companyId, doc.ruta);
      const leido = await this.lector.leer(companyId, {
        originalname: archivoDeLaRuta(doc.ruta),
        buffer,
        size: buffer.length,
      });
      if (leido.tipo === 'otro') {
        resultado.sin_traer.push(
          `${cual}: «${doc.nombre}» no parece orden de compra ni factura.`,
        );
        return;
      }
      // Con la ficha de Mercado Público, el único aviso es que la orden es
      // de otro proveedor: esa no es experiencia de la empresa.
      if (leido.datos.fuente === 'mercado_publico' && leido.aviso) {
        resultado.sin_traer.push(`${cual}: ${leido.aviso}`);
        return;
      }
      const igual = conocidos.find((c) =>
        mismoNumero(c.numero, leido.datos.numero),
      );
      if (igual) {
        resultado.ya_estaban++;
        if (igual.id && !igual.evento) {
          igual.evento = e.numero;
          await this.repo.anotarEvento(
            companyId,
            igual.id,
            soloLosDatos(igual),
          );
        }
        return;
      }
      // Antes de subir (sin esperar nada entre medio): otro evento con el
      // mismo número ya lo ve.
      conocidos.push({ ...leido.datos, evento: e.numero });
      await this.oferente.subirDocumento(
        companyId,
        cuentaId,
        {
          originalname: nombreDelRespaldo(
            leido.tipo,
            leido.datos.numero,
            extensionDe(doc.ruta),
          ),
          buffer,
          size: buffer.length,
        },
        {
          tipo: TIPO_RESPALDO,
          datos: JSON.stringify({ ...leido.datos, evento: e.numero }),
        },
      );
      resultado.traidos++;
    } catch (error) {
      this.logger.warn(
        `respaldo del evento ${e.numero} (empresa ${companyId}): ${mensajeDe(error)}`,
      );
      resultado.sin_traer.push(`${cual}: ${mensajeDe(error)}`);
    }
  }
}
