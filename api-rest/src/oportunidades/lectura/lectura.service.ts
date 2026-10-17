import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { Lectura } from './reglas';

// LA LECTURA CON IA (doc 17 §5.2). Cada proceso nuevo se lee UNA vez por
// empresa con Claude Haiku 5.5 — Felipe, 16-10: "para lectura yo creo que
// Haiku 5.5 está bien". La IA no confía en la categoría que puso el
// comprador ("la gente que sube esto lo sube mal"): lee el nombre, la
// descripción y los productos.

export const MODELO_LECTURA = 'claude-haiku-5-5';

const ESQUEMA = {
  type: 'object',
  properties: {
    semaforo: { type: 'string', enum: ['verde', 'amarillo', 'rojo'] },
    etiquetas: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'evento',
          'alimentacion',
          'alojamiento',
          'capacitacion_con_salon',
          'paseo',
          'otro',
        ],
      },
    },
    se_hace_en_el_complejo: { type: 'string', enum: ['si', 'no', 'dudoso'] },
    razon: { type: 'string' },
  },
  required: ['semaforo', 'etiquetas', 'se_hace_en_el_complejo', 'razon'],
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

/** Lo que la IA necesita saber de la empresa. */
export type PerfilDeEmpresa = {
  nombre: string;
  perfil: string | null;
  paquetes: string[];
  fijos: string[];
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

export const instruccionesPara = (empresa: PerfilDeEmpresa): string =>
  [
    `Lees licitaciones y compras ágiles de Mercado Público (Chile) para la empresa "${empresa.nombre}" y decides si le sirven.`,
    'La categoría que pone el comprador suele estar mal: decide por el nombre, la descripción y los productos que pide.',
    '',
    'LA EMPRESA',
    empresa.perfil?.trim() || '(sin descripción)',
    '',
    'SU CATÁLOGO EN EVENTIA',
    `Paquetes: ${empresa.paquetes.join('; ') || '(ninguno)'}`,
    `Servicios fijos: ${empresa.fijos.join('; ') || '(ninguno)'}`,
    '',
    'RESPONDE',
    '- etiquetas: qué pide el proceso, una o varias de: evento, alimentacion, alojamiento, capacitacion_con_salon, paseo, otro. Usa "otro" solo si no pide nada de las demás.',
    '- se_hace_en_el_complejo: "si" si el servicio se puede prestar en las instalaciones de la empresa o el lugar lo propone el oferente; "no" si exige hacerlo en dependencias del comprador, en otra ciudad, a domicilio, o si es solo entrega de productos; "dudoso" si no lo dice.',
    '- semaforo: "verde" si es del rubro de la empresa y se puede hacer en ella; "amarillo" si es del rubro pero hay una duda que conviene revisar (lugar poco claro, mezcla con cosas que no vende); "rojo" si no es del rubro, si exige hacerse fuera de la empresa o si es compra de productos.',
    '- razon: una frase corta en español que diga por qué.',
  ].join('\n');

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
   * Lee un proceso. Devuelve null si ESE proceso no se pudo leer (se
   * reintenta en la próxima corrida). Lanza LecturaDetenida si no tiene
   * sentido seguir leyendo en esta corrida.
   */
  async leer(
    proceso: ProcesoParaLeer,
    empresa: PerfilDeEmpresa,
    uso?: Uso,
  ): Promise<Lectura | null> {
    try {
      const respuesta = await this.cliente().messages.parse({
        model: MODELO_LECTURA,
        // Haiku 5.5 piensa antes de responder (pensamiento adaptativo, con
        // esfuerzo bajo); el tope deja espacio para eso y para la respuesta.
        max_tokens: 4000,
        output_config: {
          effort: 'low',
          format: jsonSchemaOutputFormat(ESQUEMA),
        },
        system: [
          {
            type: 'text',
            text: instruccionesPara(empresa),
            cache_control: { type: 'ephemeral' },
          },
        ],
        messages: [{ role: 'user', content: descripcionDe(proceso) }],
      });

      if (uso) {
        uso.entrada += respuesta.usage.input_tokens ?? 0;
        uso.salida += respuesta.usage.output_tokens ?? 0;
      }

      if (respuesta.stop_reason === 'refusal' || !respuesta.parsed_output) {
        this.logger.warn(
          `no se pudo leer ${proceso.codigo} (${respuesta.stop_reason}); queda en amarillo para revisar a mano`,
        );
        return {
          semaforo: 'amarillo',
          etiquetas: ['otro'],
          se_hace_en_el_complejo: 'dudoso',
          razon: 'La lectura automática no resultó: conviene revisarla a mano.',
        };
      }

      const salida = respuesta.parsed_output;
      return {
        semaforo: salida.semaforo,
        etiquetas: salida.etiquetas.length > 0 ? salida.etiquetas : ['otro'],
        se_hace_en_el_complejo: salida.se_hace_en_el_complejo,
        razon: salida.razon.trim(),
      };
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
}
