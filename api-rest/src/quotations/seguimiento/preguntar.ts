import type Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import {
  ServiceUnavailableException,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { esFallaDeLaCuenta } from '../generar/generar.service';
import { instruccionesDeCorreo } from './reglas-de-correo';
import { ESQUEMA_DEL_SEGUIMIENTO, type RespuestaDelSeguimiento } from './tipos';

// LA PREGUNTA A LA IA DEL SEGUIMIENTO (y de la respuesta a pedido, doc 20
// §18 sprint 3), fuera de `seguimiento.service.ts` para que no pase de 800
// líneas. Las reglas van como instrucciones fijas, en caché.

export type Uso = {
  entrada: number;
  escrituraCache: number;
  lecturaCache: number;
  salida: number;
};

export async function preguntarALaIA(
  cliente: Anthropic,
  modelo: string,
  logger: PinoLogger,
  mensaje: string,
  uso: Uso,
): Promise<RespuestaDelSeguimiento> {
  try {
    const respuesta = await cliente.messages.parse({
      model: modelo,
      max_tokens: 4000,
      output_config: {
        format: jsonSchemaOutputFormat(ESQUEMA_DEL_SEGUIMIENTO),
      },
      // Las reglas van como instrucciones fijas, en caché: «Generar
      // seguimientos» las lee mucho más barato desde el segundo.
      system: [
        {
          type: 'text',
          text: instruccionesDeCorreo(),
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [{ role: 'user', content: mensaje }],
    });
    uso.entrada += respuesta.usage.input_tokens ?? 0;
    uso.escrituraCache += respuesta.usage.cache_creation_input_tokens ?? 0;
    uso.lecturaCache += respuesta.usage.cache_read_input_tokens ?? 0;
    uso.salida += respuesta.usage.output_tokens ?? 0;
    if (respuesta.stop_reason === 'refusal') {
      throw new UnprocessableEntityException(
        'La IA no quiso escribir este seguimiento. Escríbelo a mano.',
      );
    }
    if (respuesta.stop_reason === 'max_tokens' || !respuesta.parsed_output) {
      throw new UnprocessableEntityException(
        'La respuesta de la IA llegó incompleta. Vuelve a intentarlo.',
      );
    }
    return respuesta.parsed_output as RespuestaDelSeguimiento;
  } catch (error) {
    if (error instanceof UnprocessableEntityException) throw error;
    if (esFallaDeLaCuenta(error)) {
      logger.error(`la cuenta de Anthropic falló: ${mensajeDe(error)}`);
      throw new ServiceUnavailableException(
        'La IA no está disponible ahora (cuenta de Anthropic sin cupo o con la llave mala). Prueba en un rato.',
      );
    }
    logger.error(`la IA falló: ${mensajeDe(error)}`);
    throw new ServiceUnavailableException(
      'La IA no respondió. Vuelve a intentarlo en un rato.',
    );
  }
}
