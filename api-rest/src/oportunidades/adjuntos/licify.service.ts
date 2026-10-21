import {
  BadRequestException,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { sanitize } from 'src/storage/storage.service';
import { normalizar } from '../mercado-publico/mapeo';
import { OportunidadesRepository } from '../oportunidades.repository';
import { type Adjunto, AdjuntosRepository } from './adjuntos.repository';
import {
  extensionDe,
  MAX_BYTES_ADJUNTO,
  nombreLimpio,
  sello,
  TIPOS_POR_EXTENSION,
} from './adjuntos.service';

// TRAER LOS DOCUMENTOS DE MERCADO PÚBLICO POR LICIFY (decisión 65 del doc
// 17, 21-10). Felipe: "podríamos poner un botón de bajar documentos y que
// lo lleve directamente, si cuesta tan poco por licitación".
//
// Mercado Público protege sus adjuntos con un control antirrobots que esta
// casa no esquiva. Licify es un proveedor comercial (en Apify) que guarda
// en su propio almacén lo que el comprador adjunta al publicar: bases,
// decretos, fichas técnicas, formularios y respuestas del foro. Se le pide
// la lista con la cuenta de la empresa (APIFY_TOKEN) y los archivos se
// bajan de su almacén con un GET simple. Entran por la misma puerta que lo
// subido a mano (`AdjuntosService.subir`): a «Bases y anexos», con tipo y
// tamaño validados, en el balde privado de la empresa.
//
// Lo que Licify NO tiene (medido el 21-10): el acta de evaluación y lo que
// el comprador adjunta al adjudicar, ni las ofertas de los competidores, ni
// lo anterior a fines de 2025. Eso sigue bajándolo una persona.

/** El servicio de Licify para cada tipo de proceso. */
export const ACTOR_DE_LICIFY: Readonly<
  Record<'licitacion' | 'compra_agil', string>
> = {
  licitacion: 'licify~mercadopublico-licitaciones',
  compra_agil: 'licify~mercadopublico-compraagil',
};

const APIFY = 'https://api.apify.com/v2/acts';
/** `run-sync` espera hasta 120 s por la corrida; la lista suele tardar 1. */
const TOPE_LISTA_MS = 150_000;
const TOPE_ARCHIVO_MS = 60_000;
/** Más que esto no es una licitación: es un error. */
const MAX_ARCHIVOS = 60;
/** Cómo nos presentamos al bajar: Eventia, no un navegador. */
const QUIEN_BAJA = 'Eventia/1.0 (+https://www.eventi-app.com)';

export type ArchivoDeLicify = {
  nombre: string;
  url: string;
  categoria: string | null;
  bytes: number | null;
};

export type ResultadoDeTraer = {
  /** Cuántos tiene Licify para esta licitación (0: no la conoce). */
  disponibles: number;
  bajados: Adjunto[];
  omitidos: Array<{ nombre: string; motivo: string }>;
};

/** Para saber si un archivo ya está: sin tildes, sin signos ni espacios.
 *  Licify guarda «D_A__3127_Aprueba...» donde el comprador puso «D.A. 3127
 *  Aprueba...». */
export const claveDelNombre = (nombre: string): string =>
  normalizar(nombre).replace(/[^a-z0-9]+/g, '');

/** Lo que vale de cada fila que devuelve Licify. */
export const archivosDeLaRespuesta = (
  respuesta: unknown,
): ArchivoDeLicify[] => {
  if (!Array.isArray(respuesta)) return [];
  const archivos: ArchivoDeLicify[] = [];
  for (const fila of respuesta as Array<Record<string, unknown>>) {
    const url =
      typeof fila?.file_original_url === 'string' ? fila.file_original_url : '';
    if (!/^https:\/\//.test(url)) continue;
    let nombre = url.slice(url.lastIndexOf('/') + 1);
    try {
      nombre = decodeURIComponent(nombre);
    } catch {
      // Un nombre mal codificado se usa tal cual.
    }
    if (!nombre) continue;
    archivos.push({
      nombre,
      url,
      categoria:
        typeof fila.file_category === 'string' ? fila.file_category : null,
      bytes: typeof fila.file_size === 'number' ? fila.file_size : null,
    });
  }
  return archivos;
};

@Injectable()
export class LicifyService {
  constructor(
    private readonly repo: AdjuntosRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LicifyService.name);
  }

  get configurado(): boolean {
    return Boolean(process.env.APIFY_TOKEN?.trim());
  }

  /** La lista de archivos que Licify tiene de un proceso. El token va en
   *  la cabecera, nunca en la URL ni en el registro. */
  async listar(
    codigo: string,
    tipo: 'licitacion' | 'compra_agil',
  ): Promise<ArchivoDeLicify[]> {
    const token = process.env.APIFY_TOKEN?.trim() ?? '';
    let resp: Response;
    try {
      resp = await fetch(
        `${APIFY}/${ACTOR_DE_LICIFY[tipo]}/run-sync-get-dataset-items?timeout=120&memory=1024`,
        {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            action: 'list-files',
            entityId: codigo,
            maxItems: 200,
          }),
          signal: AbortSignal.timeout(TOPE_LISTA_MS),
        },
      );
    } catch (error) {
      throw new ServiceUnavailableException(
        `Licify no respondió (${mensajeDe(error)}). Inténtalo en un rato o baja los archivos a mano.`,
      );
    }
    if (!resp.ok) {
      throw new ServiceUnavailableException(
        `Licify respondió ${resp.status}. Inténtalo en un rato o baja los archivos a mano.`,
      );
    }
    return archivosDeLaRespuesta(await resp.json().catch(() => null));
  }

  private async bajar(url: string): Promise<Buffer> {
    const resp = await fetch(url, {
      headers: { 'user-agent': QUIEN_BAJA },
      signal: AbortSignal.timeout(TOPE_ARCHIVO_MS),
    });
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    return Buffer.from(await resp.arrayBuffer());
  }

  /** Trae a «Bases y anexos» lo que Licify tiene del proceso y todavía no
   *  está (por nombre, o por el mismo peso). `cuentaId` es el id de la
   *  sesión: quién apretó el botón. */
  async traer(
    companyId: number,
    cuentaId: string,
    oportunidadId: number,
  ): Promise<ResultadoDeTraer> {
    if (!this.configurado) {
      throw new BadRequestException(
        'Falta el token de Apify en el motor (APIFY_TOKEN).',
      );
    }
    const ficha = await this.oportunidades.ficha(companyId, oportunidadId);
    if (!ficha) throw new NotFoundException('No encontramos esa oportunidad.');
    const tipo =
      (ficha.proceso as { tipo?: string } | null)?.tipo === 'compra_agil'
        ? 'compra_agil'
        : 'licitacion';

    const [archivos, yaEstan, subidoPor] = await Promise.all([
      this.listar(ficha.codigo, tipo),
      this.repo.listar(companyId, oportunidadId, 'bases'),
      this.repo.perfilDe(companyId, cuentaId),
    ]);
    const nombres = new Set(yaEstan.map((a) => claveDelNombre(a.nombre)));
    const pesos = new Set(yaEstan.map((a) => a.bytes));
    const bajados: Adjunto[] = [];
    const omitidos: ResultadoDeTraer['omitidos'] = [];

    for (const a of archivos.slice(0, MAX_ARCHIVOS)) {
      const nombre = nombreLimpio(a.nombre);
      if (
        nombres.has(claveDelNombre(nombre)) ||
        (a.bytes !== null && pesos.has(a.bytes))
      ) {
        omitidos.push({ nombre, motivo: 'ya estaba' });
        continue;
      }
      const tipoArchivo = TIPOS_POR_EXTENSION[extensionDe(nombre)];
      if (!tipoArchivo) {
        omitidos.push({ nombre, motivo: 'tipo de archivo que no se sube' });
        continue;
      }
      let contenido: Buffer;
      try {
        contenido = await this.bajar(a.url);
      } catch (error) {
        this.logger.warn(
          `licify: no se pudo bajar «${nombre}» de ${ficha.codigo}: ${mensajeDe(error)}`,
        );
        omitidos.push({ nombre, motivo: 'no se pudo bajar' });
        continue;
      }
      if (contenido.length === 0) {
        omitidos.push({ nombre, motivo: 'vino vacío' });
        continue;
      }
      if (contenido.length > MAX_BYTES_ADJUNTO) {
        omitidos.push({ nombre, motivo: 'pesa más de 30 MB' });
        continue;
      }
      const ruta = `c${companyId}/oportunidades/${oportunidadId}/${sello()}_${sanitize(nombre)}`;
      await this.repo.subirArchivo(ruta, contenido, tipoArchivo);
      try {
        const fila = await this.repo.guardar({
          company_id: companyId,
          oportunidad_id: oportunidadId,
          nombre,
          ruta,
          tipo: tipoArchivo,
          bytes: contenido.length,
          seccion: 'bases',
          subido_por: subidoPor,
        });
        bajados.push(fila);
        nombres.add(claveDelNombre(nombre));
        pesos.add(contenido.length);
      } catch (error) {
        // Sin su fila nadie lo vería: que no quede un archivo huérfano.
        await this.repo.borrarArchivo(ruta);
        throw error;
      }
    }
    this.logger.info(
      `licify: ${ficha.codigo}: ${archivos.length} disponibles, ${bajados.length} bajados, ${omitidos.length} omitidos`,
    );
    return { disponibles: archivos.length, bajados, omitidos };
  }
}
