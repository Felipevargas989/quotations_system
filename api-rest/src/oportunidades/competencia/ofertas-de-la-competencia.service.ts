import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { sanitize } from 'src/storage/storage.service';
import { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import {
  MAX_BYTES_ADJUNTO,
  TIPOS_POR_EXTENSION,
  extensionDe,
  nombreLimpio,
  sello,
} from '../adjuntos/adjuntos.service';
import { normalizarRut } from '../historia/ganadores';
import { OferenteRepository } from '../oferente/oferente.repository';
import {
  type ArchivoDelAnexo,
  type Pedir,
  archivosDelAnexo,
  ofertasDeLaLicitacion,
  pedirPublico,
} from './ofertas-publicas';
import { ResultadosRepository } from './resultados.repository';

// TRAER LAS OFERTAS DE LA COMPETENCIA (decisión 96 del doc 17, 27-10).
// Cuando una licitación queda ganada o perdida (la 92, o a mano) y la
// empresa no subió ninguna oferta de la competencia, se traen del «Resumen
// de ofertas» público: los anexos de cada oferente que no es la empresa,
// a la sección «competencia» de la comparación (decisión 41), con su nombre.
// Los comprimidos (ZIP, RAR, 7z) no se traen: suelen repetir los PDF y la
// comparación no los lee.

/** Por licitación, para no llenar el balde con una sola. */
const MAX_ARCHIVOS = 80;
const MAX_BYTES = 200 * 1024 * 1024;
const COMPRIMIDOS = new Set(['zip', 'rar', '7z']);

@Injectable()
export class OfertasDeLaCompetenciaService {
  constructor(
    private readonly resultados: ResultadosRepository,
    private readonly adjuntos: AdjuntosRepository,
    private readonly oferente: OferenteRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OfertasDeLaCompetenciaService.name);
  }

  /** Devuelve cuántos archivos se trajeron. */
  async traer(
    companyId: number,
    hasta: number,
    pedir: Pedir = pedirPublico,
  ): Promise<number> {
    const pendientes =
      await this.resultados.licitacionesSinCompetencia(companyId);
    if (pendientes.length === 0) return 0;
    const rut = normalizarRut(
      (await this.oferente.oferente(companyId))?.rut ?? '',
    );
    let traidos = 0;
    for (const p of pendientes) {
      if (Date.now() > hasta) break;
      try {
        traidos += await this.deUnaLicitacion(companyId, p, rut, hasta, pedir);
      } catch (error) {
        this.logger.warn(
          `ofertas de ${p.codigo}: no se pudieron traer: ${mensajeDe(error)}`,
        );
      }
    }
    return traidos;
  }

  private async deUnaLicitacion(
    companyId: number,
    p: { id: number; codigo: string },
    rutDeLaEmpresa: string,
    hasta: number,
    pedir: Pedir,
  ): Promise<number> {
    const ofertas = (await ofertasDeLaLicitacion(p.codigo, pedir)).filter(
      (o) => normalizarRut(o.rut) !== rutDeLaEmpresa,
    );
    const vistos = new Set<string>();
    let archivos = 0;
    let bytes = 0;
    const aceptar = (a: ArchivoDelAnexo) =>
      archivos < MAX_ARCHIVOS &&
      !COMPRIMIDOS.has(extensionDe(a.nombre)) &&
      Boolean(TIPOS_POR_EXTENSION[extensionDe(a.nombre)]) &&
      (a.kb === null || a.kb * 1024 <= MAX_BYTES_ADJUNTO);
    for (const o of ofertas) {
      for (const url of Object.values(o.anexos)) {
        for await (const a of archivosDelAnexo(url, aceptar, pedir)) {
          if (Date.now() > hasta || bytes > MAX_BYTES) break;
          const nombre = nombreLimpio(a.nombre);
          const tipo = TIPOS_POR_EXTENSION[extensionDe(nombre)];
          const clave = `${o.rut}|${nombre}|${a.contenido.length}`;
          if (
            !tipo ||
            vistos.has(clave) ||
            a.contenido.length === 0 ||
            a.contenido.length > MAX_BYTES_ADJUNTO
          ) {
            continue;
          }
          vistos.add(clave);
          await this.guardar(
            companyId,
            p.id,
            nombre,
            tipo,
            a.contenido,
            o.proveedor,
          );
          archivos += 1;
          bytes += a.contenido.length;
        }
      }
    }
    this.logger.info(
      `ofertas de ${p.codigo}: ${ofertas.length} de la competencia, ${archivos} archivos traídos`,
    );
    return archivos;
  }

  private async guardar(
    companyId: number,
    oportunidadId: number,
    nombre: string,
    tipo: string,
    contenido: Buffer,
    competidor: string,
  ): Promise<void> {
    const ruta = `c${companyId}/oportunidades/${oportunidadId}/competencia/${sello()}_${sanitize(nombre)}`;
    await this.adjuntos.subirArchivo(ruta, contenido, tipo);
    try {
      await this.adjuntos.guardar({
        company_id: companyId,
        oportunidad_id: oportunidadId,
        nombre,
        ruta,
        tipo,
        bytes: contenido.length,
        seccion: 'competencia',
        subido_por: null,
        competidor,
      });
    } catch (error) {
      // Sin su fila nadie lo vería: que no quede un archivo huérfano.
      await this.adjuntos.borrarArchivo(ruta);
      throw error;
    }
  }
}
