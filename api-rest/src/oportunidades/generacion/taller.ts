import Anthropic, { toFile } from '@anthropic-ai/sdk';
import { MODELO_OPUS, type UsoDeTokens } from '../analisis/comun';

// EL TALLER DE WORD DE LA IA (doc 17, sprint 3, paso 4). Lo decidido el
// 17-10: "el Word original, con ejecución de código".
//
// Claude trabaja en un contenedor de Anthropic, sin internet, con ejecución
// de código y la habilidad de Word de Anthropic (docx). Recibe los archivos
// por la Files API (un bloque `container_upload` por archivo), los edita con
// Python y deja lo que entrega en $OUTPUT_DIR, desde donde la API lo
// devuelve como `file_id`. Cada archivo se baja al tiro y después se borra
// de Anthropic, lo subido y lo entregado. Lo que queda dentro del
// contenedor se borra solo a los 30 días.
//
// Sin encabezado beta: la ejecución de código, la Files API y las
// habilidades ya son estables (SDK 0.135). El cómputo del contenedor se
// cobra aparte de los tokens, con 1.550 horas gratis al mes por
// organización.

export const HABILIDAD_DE_WORD = {
  type: 'anthropic',
  skill_id: 'docx',
  version: 'latest',
} as const;

export const EJECUCION_DE_CODIGO = {
  type: 'code_execution_20250825',
  name: 'code_execution',
} as const;

/** Un trabajo largo se pausa (`pause_turn`) y se retoma en el mismo
 *  contenedor. Más vueltas que esto ya no es normal. */
export const MAX_REANUDACIONES = 8;

export type ArchivoParaElTaller = {
  nombre: string;
  datos: Buffer;
  tipo: string;
};
export type ArchivoDelTaller = { nombre: string; datos: Buffer };

export type PedidoAlTaller = {
  /** Sin decirlo, Opus 5.5 (el modelo por tarea vive en comun.ts). */
  modelo?: string;
  sistema: string;
  texto: string;
  archivos: ArchivoParaElTaller[];
  esfuerzo?: 'low' | 'medium' | 'high';
  maxTokens?: number;
};

export type ResultadoDelTaller = {
  /** Lo que dejó en $OUTPUT_DIR, por nombre (si entregó dos veces el mismo,
   *  vale el último). */
  archivos: ArchivoDelTaller[];
  /** Lo último que escribió, por si no dejó el informe. */
  texto: string;
  uso: UsoDeTokens;
  /** Por qué terminó: end_turn, max_tokens, refusal… */
  motivo: string | null;
};

/** Los `file_id` de lo que la IA dejó en $OUTPUT_DIR, en orden. */
export const archivosEntregados = (
  contenido: Anthropic.ContentBlock[],
): string[] => {
  const ids: string[] = [];
  for (const b of contenido) {
    if (
      b.type === 'bash_code_execution_tool_result' &&
      b.content.type === 'bash_code_execution_result'
    ) {
      ids.push(...b.content.content.map((s) => s.file_id));
    } else if (
      b.type === 'code_execution_tool_result' &&
      b.content.type !== 'code_execution_tool_result_error'
    ) {
      ids.push(...b.content.content.map((s) => s.file_id));
    }
  }
  return ids;
};

const textoDe = (contenido: Anthropic.ContentBlock[]): string =>
  contenido
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim();

const sumar = (uso: UsoDeTokens, u: Anthropic.Usage) => {
  uso.entrada += u.input_tokens ?? 0;
  uso.salida += u.output_tokens ?? 0;
  uso.cacheEscrita += u.cache_creation_input_tokens ?? 0;
  uso.cacheLeida += u.cache_read_input_tokens ?? 0;
};

/** Manda el trabajo al taller y trae lo que entregó. Lanza si falla la API
 *  (lo traduce quien llama, con `errorDeIA`). */
export async function trabajarEnElTaller(
  cliente: Anthropic,
  pedido: PedidoAlTaller,
): Promise<ResultadoDelTaller> {
  const subidos: string[] = [];
  const entregados: string[] = [];
  try {
    for (const a of pedido.archivos) {
      const subido = await cliente.files.upload({
        file: await toFile(a.datos, a.nombre, { type: a.tipo }),
      });
      subidos.push(subido.id);
    }

    const mensajes: Anthropic.MessageParam[] = [
      {
        role: 'user',
        content: [
          ...subidos.map(
            (id): Anthropic.ContainerUploadBlockParam => ({
              type: 'container_upload',
              file_id: id,
            }),
          ),
          { type: 'text', text: pedido.texto },
        ],
      },
    ];
    const uso: UsoDeTokens = {
      entrada: 0,
      salida: 0,
      cacheEscrita: 0,
      cacheLeida: 0,
    };
    let contenedor: string | undefined;
    let respuesta: Anthropic.Message | null = null;
    for (let vuelta = 0; vuelta <= MAX_REANUDACIONES; vuelta++) {
      respuesta = await cliente.messages
        .stream({
          model: pedido.modelo ?? MODELO_OPUS,
          max_tokens: pedido.maxTokens ?? 32_000,
          output_config: { effort: pedido.esfuerzo ?? 'medium' },
          // La caché que se corre sola: cada vuelta lee lo anterior a un
          // décimo del precio.
          cache_control: { type: 'ephemeral' },
          system: pedido.sistema,
          container: {
            ...(contenedor ? { id: contenedor } : {}),
            skills: [HABILIDAD_DE_WORD],
          },
          tools: [EJECUCION_DE_CODIGO],
          messages: mensajes,
        })
        .finalMessage();
      sumar(uso, respuesta.usage);
      contenedor = respuesta.container?.id ?? contenedor;
      entregados.push(...archivosEntregados(respuesta.content));
      if (respuesta.stop_reason !== 'pause_turn') break;
      // Se pausó a la mitad: se le devuelve lo que llevaba, tal cual, y
      // sigue en el mismo contenedor.
      mensajes.push({
        role: 'assistant',
        content: respuesta.content as unknown as Anthropic.ContentBlockParam[],
      });
    }

    const porNombre = new Map<string, Buffer>();
    for (const id of entregados) {
      const [datos, descarga] = await Promise.all([
        cliente.files.retrieveMetadata(id),
        cliente.files.download(id),
      ]);
      porNombre.set(datos.filename, Buffer.from(await descarga.arrayBuffer()));
    }
    return {
      archivos: [...porNombre].map(([nombre, datos]) => ({ nombre, datos })),
      texto: respuesta ? textoDe(respuesta.content) : '',
      uso,
      motivo: respuesta?.stop_reason ?? null,
    };
  } finally {
    // Nada de la empresa se queda en Anthropic: ni lo que se subió ni lo
    // que entregó. Si un borrado falla, no detiene el trabajo.
    await Promise.allSettled(
      [...subidos, ...entregados].map((id) => cliente.files.delete(id)),
    );
  }
}
