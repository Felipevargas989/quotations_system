import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import {
  costoEnDolares,
  errorDeIA,
  MODELO_HAIKU,
} from '../../oportunidades/analisis/comun';
import {
  ESQUEMA_DE_LA_OC,
  instruccionesDeLaOC,
  propuestaDeLaLectura,
  type PropuestaDeOC,
} from './leer-orden-de-compra';
import { OrdenesDeCompraRepository } from './ordenes-de-compra.repository';

// «✨ Leer con BelIA» una orden de compra de Documentos (doc 19, paso 2b).
// Haiku la lee como los respaldos de Oportunidades (leer-respaldo.service):
// unos US$0,002 por documento. Nada se guarda: lo leído llena el formulario
// y la persona confirma.

const MEDIOS: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const MAX_BYTES = 15 * 1024 * 1024;

@Injectable()
export class LeerOrdenDeCompraService {
  private clienteAnthropic?: Anthropic;

  constructor(
    private readonly repo: OrdenesDeCompraRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LeerOrdenDeCompraService.name);
  }

  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({
        maxRetries: 2,
        timeout: 2 * 60 * 1000,
      });
    }
    return this.clienteAnthropic;
  }

  async leer(
    quotationId: string,
    companyId: number,
    documentoId: number,
  ): Promise<{
    propuesta: PropuestaDeOC;
    avisos: string[];
    documento_id: number;
  }> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new BadRequestException('Falta la llave de Anthropic en el motor.');
    }
    if (!(await this.repo.cotizacionDeLaEmpresa(quotationId, companyId))) {
      throw new NotFoundException('Ese evento no existe');
    }
    const doc = await this.repo.documentoDelEvento(documentoId, quotationId);
    if (!doc) {
      throw new NotFoundException(
        'Ese PDF no está en los documentos de este evento',
      );
    }
    // La ruta de la empresa, o una vieja sin prefijo (mapa 04 §5.2): el
    // documento ya se verificó por la cotización.
    const ruta = doc.file_url ?? '';
    if (
      !ruta.startsWith(`c${companyId}/`) &&
      !ruta.startsWith('event-documents/')
    ) {
      throw new BadRequestException('Ese documento no se puede leer.');
    }
    const medio = MEDIOS[(ruta.split('.').pop() ?? '').toLowerCase()];
    if (!medio) {
      throw new BadRequestException(
        'BelIA lee la orden de compra en PDF o como foto (JPG, PNG o WebP).',
      );
    }
    const buffer = await this.repo.descargar(ruta);
    if (buffer.length > MAX_BYTES) {
      throw new BadRequestException('Pesa más de 15 MB.');
    }
    const empresa = await this.repo.empresaQueVende(companyId);
    const data = buffer.toString('base64');
    const bloque: Anthropic.ContentBlockParam =
      medio === 'application/pdf'
        ? {
            type: 'document',
            source: { type: 'base64', media_type: 'application/pdf', data },
          }
        : {
            type: 'image',
            source: {
              type: 'base64',
              media_type: medio as 'image/jpeg' | 'image/png' | 'image/webp',
              data,
            },
          };

    let leido: ReturnType<typeof propuestaDeLaLectura>;
    try {
      const respuesta = await this.cliente().messages.parse({
        model: MODELO_HAIKU,
        max_tokens: 2000,
        output_config: { format: jsonSchemaOutputFormat(ESQUEMA_DE_LA_OC) },
        system: instruccionesDeLaOC(empresa),
        messages: [
          {
            role: 'user',
            content: [
              bloque,
              { type: 'text', text: 'Lee esta orden de compra.' },
            ],
          },
        ],
      });
      leido = propuestaDeLaLectura(respuesta.parsed_output, empresa);
      const entrada = respuesta.usage.input_tokens ?? 0;
      const salida = respuesta.usage.output_tokens ?? 0;
      this.logger.info(
        `OC leída (empresa ${companyId}, documento ${documentoId}): ${entrada} tokens de entrada, ${salida} de salida, US$${costoEnDolares(entrada, salida, MODELO_HAIKU)}`,
      );
    } catch (error) {
      this.logger.warn(`leer una OC: ${mensajeDe(error)}`);
      throw new BadRequestException(
        errorDeIA(error, 'BelIA no pudo leer la orden de compra'),
      );
    }
    if (!leido) {
      throw new BadRequestException(
        'Ese documento no parece una orden de compra, o no trae su N°: cárgala a mano.',
      );
    }
    const yaCargada = (
      await this.repo.deCotizacion(quotationId, companyId)
    ).some((o) => o.numero === leido.propuesta.numero);
    if (yaCargada) {
      leido.avisos.unshift(
        `La OC N° ${leido.propuesta.numero} ya está cargada en este evento.`,
      );
    }
    return { ...leido, documento_id: documentoId };
  }
}
