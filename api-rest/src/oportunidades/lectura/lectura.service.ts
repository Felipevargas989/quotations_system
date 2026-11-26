import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import {
  type Candidata,
  ESQUEMA_DE_REPETICION,
  INSTRUCCIONES_DE_REPETICION,
  type Repeticion,
  repeticionValida,
} from '../historia/repeticion';
import {
  DEFINICION_DEL_RUBRO,
  instruccionesDeCandidatas,
  type PerfilDeEmpresa,
  type Rubro,
  rubroDeLaInstalacion,
} from '../rubro/rubro-de-la-instalacion';
import { type Lectura, lecturaValida } from './reglas';

export type { PerfilDeEmpresa } from '../rubro/rubro-de-la-instalacion';

// LA LECTURA CON IA (doc 17 §5.2). Cada proceso nuevo se lee UNA vez por
// empresa con Claude Haiku 5.5 — Felipe, 16-10: "para lectura yo creo que
// Haiku 5.5 está bien". La IA no confía en la categoría que puso el
// comprador ("la gente que sube esto lo sube mal"): lee el nombre, la
// descripción y los productos.

export const MODELO_LECTURA = 'claude-haiku-5-5';

/** Con qué se leyó: el modelo y la versión de las reglas. Cuando las reglas
 *  cambian, lo abierto que nadie ha tocado se relee solo en la pasada
 *  siguiente (decisión 19 del doc 17). Cambiarlo al cambiar las reglas.
 *  11-11: el monto mínimo de la empresa (decisión 129). */
export const lecturaActual = (rubro: Rubro = 'eventos'): string =>
  `${MODELO_LECTURA}, ${DEFINICION_DEL_RUBRO[rubro].reglasDeLectura}`;

/** La de eventos, la de siempre (Valle del Sol). Una instalación con otro
 *  rubro anota `lecturaActual(rubroDeLaInstalacion())`, que nunca se
 *  confunde con esta. */
export const LECTURA_ACTUAL = lecturaActual('eventos');

/** La salida fija de la lectura: las etiquetas son las del rubro. */
const esquemaCon = <E extends readonly string[]>(etiquetas: E) =>
  ({
    type: 'object',
    properties: {
      semaforo: { type: 'string', enum: ['verde', 'amarillo', 'rojo'] },
      etiquetas: {
        type: 'array',
        items: {
          type: 'string',
          enum: etiquetas,
        },
      },
      se_hace_en_el_complejo: { type: 'string', enum: ['si', 'no', 'dudoso'] },
      razon: { type: 'string' },
    },
    required: ['semaforo', 'etiquetas', 'se_hace_en_el_complejo', 'razon'],
    additionalProperties: false,
  }) as const;

export const esquemaDeLectura = (rubro: Rubro = 'eventos') =>
  esquemaCon(DEFINICION_DEL_RUBRO[rubro].etiquetas);

const ESQUEMA_DE_CANDIDATAS = {
  type: 'object',
  properties: {
    candidatas: { type: 'array', items: { type: 'integer' } },
  },
  required: ['candidatas'],
  additionalProperties: false,
} as const;

/** Lo que la IA necesita saber del proceso. */
export type ProcesoParaLeer = {
  codigo: string;
  tipo: string;
  nombre: string;
  descripcion: string | null;
  organismo: string | null;
  unidad: string | null;
  comuna: string | null;
  region: string | null;
  monto: number | null;
  fecha_cierre: string | null;
  productos: Array<{ nombre?: string | null; descripcion?: string | null }>;
};

/** La lectura no puede seguir en esta corrida (llave mala, sin cupo):
 *  lo que falte se lee en la próxima. */
export class LecturaDetenida extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'LecturaDetenida';
  }
}

export type Uso = { entrada: number; salida: number };

const recortar = (t: string | null | undefined, max: number): string => {
  const s = (t ?? '').trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
};

/** Las instrucciones de la lectura del radar: el texto es del rubro
 *  (eventos, el de siempre, por defecto). */
export const instruccionesPara = (
  empresa: PerfilDeEmpresa,
  rubro: Rubro = 'eventos',
): string => DEFINICION_DEL_RUBRO[rubro].lectura(empresa);

export const descripcionDe = (p: ProcesoParaLeer): string => {
  const productos = (p.productos ?? [])
    .slice(0, 30)
    .map(
      (x) =>
        `- ${recortar(x.nombre, 160)}${x.descripcion ? `: ${recortar(x.descripcion, 300)}` : ''}`,
    )
    .join('\n');
  const comprador = [p.organismo, p.unidad, p.comuna, p.region]
    .filter(Boolean)
    .join(' — ');
  return [
    `Proceso ${p.codigo} (${p.tipo === 'compra_agil' ? 'compra ágil' : 'licitación'})`,
    `Nombre: ${p.nombre}`,
    `Comprador: ${comprador || '(no informado)'}`,
    `Monto: ${p.monto ? `$${Math.round(p.monto).toLocaleString('es-CL')}` : '(no informado)'}`,
    `Cierre: ${p.fecha_cierre ?? '(no informado)'}`,
    `Descripción: ${recortar(p.descripcion, 3000) || '(sin descripción)'}`,
    'Productos:',
    productos || '(sin detalle)',
  ].join('\n');
};

/** Fallas que no son de un proceso sino de la cuenta o del pedido: con
 *  ellas, el siguiente proceso fallaría igual. Llave mala o sin permiso,
 *  sin cupo por minuto, el modelo no existe, o se acabó el saldo. */
const esFallaDeLaCuenta = (error: unknown): boolean =>
  error instanceof Anthropic.AuthenticationError ||
  error instanceof Anthropic.PermissionDeniedError ||
  error instanceof Anthropic.RateLimitError ||
  error instanceof Anthropic.NotFoundError ||
  (error instanceof Anthropic.BadRequestError &&
    /credit balance/i.test(error.message));

@Injectable()
export class LecturaService {
  private clienteAnthropic: Anthropic | null = null;

  constructor(private readonly logger: PinoLogger) {
    this.logger.setContext(LecturaService.name);
  }

  get configurado(): boolean {
    return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
  }

  /** El cliente se crea al primer uso; lee ANTHROPIC_API_KEY. Paciente con
   *  los 429: una cuenta nueva tiene poco cupo por minuto, y el SDK espera
   *  lo que la API le pide antes de cada reintento. */
  protected cliente(): Anthropic {
    if (!this.clienteAnthropic) {
      this.clienteAnthropic = new Anthropic({ maxRetries: 6 });
    }
    return this.clienteAnthropic;
  }

  /**
   * El filtro de la historia: de `filas`, los códigos cuyo nombre podría ser
   * del rubro. null si no se pudo (el día queda pendiente). Lanza
   * LecturaDetenida si falla la cuenta. El rubro es el de la instalación;
   * `perfil` solo lo usa el rubro `general` (el de eventos no lo lee).
   */
  async candidatasPorNombre(
    filas: Array<{ codigo: string; nombre: string }>,
    uso?: Uso,
    perfil: string | null = null,
  ): Promise<Set<string> | null> {
    if (filas.length === 0) return new Set();
    try {
      const respuesta = await this.cliente().messages.parse({
        model: MODELO_LECTURA,
        max_tokens: 4000,
        output_config: {
          effort: 'low',
          format: jsonSchemaOutputFormat(ESQUEMA_DE_CANDIDATAS),
        },
        system: [
          {
            type: 'text',
            text: instruccionesDeCandidatas(rubroDeLaInstalacion(), perfil),
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [
          {
            role: 'user',
            content: filas
              .map((f, i) => `${i + 1}. ${recortar(f.nombre, 200)}`)
              .join('\n'),
          },
        ],
      });
      if (uso) {
        uso.entrada += respuesta.usage.input_tokens ?? 0;
        uso.salida += respuesta.usage.output_tokens ?? 0;
      }
      if (!respuesta.parsed_output) return null;
      const codigos = new Set<string>();
      for (const n of respuesta.parsed_output.candidatas) {
        const fila = filas[n - 1];
        if (fila) codigos.add(fila.codigo);
      }
      return codigos;
    } catch (error) {
      if (esFallaDeLaCuenta(error)) {
        throw new LecturaDetenida(
          `el filtro de la historia se detiene en esta corrida: ${mensajeDe(error)}`,
        );
      }
      this.logger.warn(`no pude filtrar la historia: ${mensajeDe(error)}`);
      return null;
    }
  }

  /**
   * Lee un proceso. Devuelve null si ESE proceso no se pudo leer (se
   * reintenta en la próxima corrida). Lanza LecturaDetenida si no tiene
   * sentido seguir leyendo en esta corrida.
   */
  async leer(
    proceso: ProcesoParaLeer,
    empresa: PerfilDeEmpresa,
    uso?: Uso,
  ): Promise<Lectura | null> {
    const rubro = rubroDeLaInstalacion();
    try {
      const respuesta = await this.cliente().messages.parse({
        model: MODELO_LECTURA,
        // Haiku 5.5 piensa antes de responder (pensamiento adaptativo, con
        // esfuerzo bajo); el tope deja espacio para eso y para la respuesta.
        max_tokens: 4000,
        output_config: {
          effort: 'low',
          format: jsonSchemaOutputFormat(esquemaDeLectura(rubro)),
        },
        system: [
          {
            type: 'text',
            text: instruccionesPara(empresa, rubro),
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: descripcionDe(proceso) }],
      });

      if (uso) {
        uso.entrada += respuesta.usage.input_tokens ?? 0;
        uso.salida += respuesta.usage.output_tokens ?? 0;
      }

      // Lo que contestó se revisa antes de usarlo (18-10: un color que no
      // era verde, amarillo ni rojo tumbó la pasada de las 23:07).
      const valida = respuesta.parsed_output
        ? lecturaValida(respuesta.parsed_output, rubro)
        : null;
      if (respuesta.stop_reason === 'refusal' || !valida) {
        this.logger.warn(
          `no se pudo leer ${proceso.codigo} (${respuesta.stop_reason}; contestó ${JSON.stringify(respuesta.parsed_output ?? null).slice(0, 200)}); queda en amarillo para revisar a mano`,
        );
        return {
          semaforo: 'amarillo',
          etiquetas: ['otro'],
          se_hace_en_el_complejo: 'dudoso',
          razon: 'La lectura automática no resultó: conviene revisarla a mano.',
        };
      }
      return valida;
    } catch (error) {
      if (esFallaDeLaCuenta(error)) {
        throw new LecturaDetenida(
          `la lectura con IA se detiene en esta corrida: ${mensajeDe(error)}`,
        );
      }
      this.logger.warn(
        `no pude leer ${proceso.codigo}: ${mensajeDe(error)}; se reintenta en la próxima corrida`,
      );
      return null;
    }
  }

  /**
   * ¿Cuáles de `candidatas` son ediciones anteriores del mismo evento que
   * `pregunta` (decisión 63)? null si no se pudo (se reintenta); lanza
   * LecturaDetenida si falla la cuenta.
   */
  async edicionesAnteriores(
    pregunta: string,
    candidatas: readonly Candidata[],
    uso?: Uso,
  ): Promise<Repeticion | null> {
    try {
      const respuesta = await this.cliente().messages.parse({
        model: MODELO_LECTURA,
        max_tokens: 4000,
        output_config: {
          effort: 'low',
          format: jsonSchemaOutputFormat(ESQUEMA_DE_REPETICION),
        },
        system: [
          {
            type: 'text',
            text: INSTRUCCIONES_DE_REPETICION,
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: pregunta }],
      });
      if (uso) {
        uso.entrada += respuesta.usage.input_tokens ?? 0;
        uso.salida += respuesta.usage.output_tokens ?? 0;
      }
      return respuesta.parsed_output
        ? repeticionValida(respuesta.parsed_output, candidatas)
        : null;
    } catch (error) {
      if (esFallaDeLaCuenta(error)) {
        throw new LecturaDetenida(
          `la revisión de lo que se repite se detiene: ${mensajeDe(error)}`,
        );
      }
      this.logger.warn(`no pude revisar si se repite: ${mensajeDe(error)}`);
      return null;
    }
  }
}
