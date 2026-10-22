import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { extensionDe, nombreLimpio } from '../adjuntos/adjuntos.service';
import { costoEnDolares, errorDeIA, MODELO_HAIKU } from '../analisis/comun';
import {
  datosDelRespaldoLeido,
  ESQUEMA_DEL_RESPALDO,
  instruccionesDelRespaldo,
  type RespaldoLeido,
} from './leer-respaldo';
import { OferenteRepository } from './oferente.repository';
import {
  type ArchivoRecibido,
  MAX_BYTES_DOCUMENTO,
  OferenteService,
} from './oferente.service';
import { CODIGO_DE_ORDEN } from './orden-de-compra';
import type { DatosDeRespaldo } from './respaldo';

// «Leer solo» una orden de compra o una factura (decisión 34, 19-10): Haiku
// la lee (unos US$0,002 por documento) y, si es de Mercado Público, la
// ficha pública confirma los datos. Ver leer-respaldo.ts.

const MEDIOS: Readonly<Record<string, string>> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

@Injectable()
export class LeerRespaldoService {
  private clienteAnthropic?: Anthropic;

  constructor(
    private readonly oferente: OferenteService,
    private readonly repo: OferenteRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LeerRespaldoService.name);
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
    companyId: number,
    archivo: ArchivoRecibido | undefined,
  ): Promise<{
    datos: DatosDeRespaldo;
    aviso: string | null;
    tipo: RespaldoLeido['tipo'];
  }> {
    if (!process.env.ANTHROPIC_API_KEY?.trim()) {
      throw new BadRequestException('Falta la llave de Anthropic en el motor.');
    }
    if (!archivo || archivo.size <= 0) {
      throw new BadRequestException('No llegó ningún archivo.');
    }
    const medio = MEDIOS[extensionDe(nombreLimpio(archivo.originalname))];
    if (!medio) {
      throw new BadRequestException(
        'Para leerlo solo, sube la orden de compra o la factura en PDF o como foto (JPG, PNG o WebP).',
      );
    }
    if (archivo.size > MAX_BYTES_DOCUMENTO) {
      throw new BadRequestException('Pesa más de 15 MB.');
    }
    const empresa = await this.repo.oferente(companyId);
    const data = archivo.buffer.toString('base64');
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

    let leido: ReturnType<typeof datosDelRespaldoLeido>;
    try {
      const respuesta = await this.cliente().messages.parse({
        model: MODELO_HAIKU,
        max_tokens: 1500,
        output_config: { format: jsonSchemaOutputFormat(ESQUEMA_DEL_RESPALDO) },
        system: instruccionesDelRespaldo({
          razon_social: empresa?.razon_social ?? null,
          rut: empresa?.rut ?? null,
        }),
        messages: [
          {
            role: 'user',
            content: [bloque, { type: 'text', text: 'Lee este documento.' }],
          },
        ],
      });
      leido = datosDelRespaldoLeido(respuesta.parsed_output);
      const entrada = respuesta.usage.input_tokens ?? 0;
      const salida = respuesta.usage.output_tokens ?? 0;
      this.logger.info(
        `respaldo leído (empresa ${companyId}): ${entrada} tokens de entrada, ${salida} de salida, US$${costoEnDolares(entrada, salida, MODELO_HAIKU)}`,
      );
    } catch (error) {
      this.logger.warn(`leer un respaldo: ${mensajeDe(error)}`);
      throw new BadRequestException(
        errorDeIA(error, 'No se pudo leer el documento'),
      );
    }
    if (!leido) {
      throw new BadRequestException(
        'No encontré el número de la orden de compra o de la factura: complétalo a mano.',
      );
    }
    const datos: DatosDeRespaldo = {
      numero: leido.numero,
      mandante: leido.mandante,
      contrato: leido.contrato,
      anio: leido.anio,
      monto: leido.monto,
      fuente: 'manual',
    };
    const tipo = leido.tipo;
    const numero = datos.numero.toUpperCase();
    if (!CODIGO_DE_ORDEN.test(numero)) return { datos, aviso: null, tipo };
    // Una orden de Mercado Público: manda su ficha pública.
    try {
      const { orden, aviso } = await this.oferente.ordenDeCompra(
        companyId,
        numero,
      );
      return {
        datos: {
          numero: orden.numero,
          mandante: orden.mandante ?? datos.mandante,
          contrato: orden.contrato || datos.contrato,
          anio: orden.anio ?? datos.anio,
          monto: orden.monto ?? datos.monto,
          fuente: 'mercado_publico',
        },
        aviso,
        tipo,
      };
    } catch {
      return {
        datos,
        aviso:
          'No se pudo confirmar en Mercado Público: revisa los datos antes de guardar.',
        tipo,
      };
    }
  }
}
