import type Anthropic from '@anthropic-ai/sdk';
import {
  archivosEntregados,
  EJECUCION_DE_CODIGO,
  HABILIDAD_DE_WORD,
  trabajarEnElTaller,
} from '../generacion/taller';

// EL TALLER DE WORD (doc 17, sprint 3, paso 4): lo que se manda a Anthropic,
// cómo se retoma un trabajo pausado, lo que se trae y que nada de la
// empresa se quede allá. La API va de mentira.

type Pedido = {
  model: string;
  container: { id?: string; skills: unknown[] };
  tools: unknown[];
  cache_control: unknown;
  output_config: { effort: string };
  system: string;
  messages: Array<{ role: string; content: Array<Record<string, unknown>> }>;
};

const entrega = (...ids: string[]) => ({
  type: 'bash_code_execution_tool_result',
  tool_use_id: 'srvtoolu_1',
  content: {
    type: 'bash_code_execution_result',
    stdout: 'lleno_6.docx informe.json',
    stderr: '',
    return_code: 0,
    content: ids.map((file_id) => ({
      type: 'bash_code_execution_output',
      file_id,
    })),
  },
});

const respuesta = (
  stop_reason: string,
  content: unknown[],
  uso: Partial<Anthropic.Usage> = {},
) => ({
  stop_reason,
  content,
  container: { id: 'contenedor-1', expires_at: '', skills: null },
  usage: {
    input_tokens: 1_000,
    output_tokens: 500,
    cache_creation_input_tokens: 2_000,
    cache_read_input_tokens: 10_000,
    ...uso,
  },
});

function clienteDePrueba(respuestas: unknown[]) {
  // Lo que se le pasó a cada vuelta, copiado: el motor sigue agregando al
  // mismo arreglo de mensajes.
  const pedidos: Pedido[] = [];
  const stream = jest.fn((p: Pedido) => {
    pedidos.push(JSON.parse(JSON.stringify(p)) as Pedido);
    const r = respuestas.shift();
    return {
      finalMessage: () =>
        r instanceof Error ? Promise.reject(r) : Promise.resolve(r),
    };
  });
  let subidos = 0;
  const archivos = {
    upload: jest.fn<Promise<{ id: string }>, [{ file: File }]>(() =>
      Promise.resolve({ id: `subido-${++subidos}` }),
    ),
    retrieveMetadata: jest.fn((id: string) =>
      Promise.resolve({
        id,
        filename: id === 'f-informe' ? 'informe.json' : `lleno_6.docx`,
      }),
    ),
    download: jest.fn((id: string) =>
      Promise.resolve(new Response(Buffer.from(`contenido de ${id}`))),
    ),
    delete: jest.fn<Promise<{ id: string; type: string }>, [string]>(() =>
      Promise.resolve({ id: '', type: 'file_deleted' }),
    ),
  };
  const cliente = {
    files: archivos,
    messages: { stream },
  } as unknown as Anthropic;
  return { cliente, archivos, pedidos };
}

const PEDIDO = {
  sistema: 'Llenas los anexos.',
  texto: 'Llena los anexos.',
  archivos: [
    {
      nombre: 'anexo_6.docx',
      datos: Buffer.from('word'),
      tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    },
  ],
};

describe('el taller de Word de la IA', () => {
  it('sube cada archivo, lo monta en el contenedor con la habilidad de Word y la ejecución de código, trae lo entregado y no deja nada en Anthropic', async () => {
    const { cliente, archivos, pedidos } = clienteDePrueba([
      respuesta('end_turn', [
        entrega('f-lleno', 'f-informe'),
        { type: 'text', text: 'Listo.', citations: null },
      ]),
    ]);

    const r = await trabajarEnElTaller(cliente, PEDIDO);

    const [[subida]] = archivos.upload.mock.calls;
    expect(subida.file.name).toBe('anexo_6.docx');
    const [p] = pedidos;
    expect(p.model).toBe('claude-opus-5-5');
    expect(p.container).toEqual({ skills: [HABILIDAD_DE_WORD] });
    expect(p.tools).toEqual([EJECUCION_DE_CODIGO]);
    expect(p.cache_control).toEqual({ type: 'ephemeral' });
    expect(p.output_config.effort).toBe('medium');
    expect(p.system).toBe('Llenas los anexos.');
    expect(p.messages[0].content).toEqual([
      { type: 'container_upload', file_id: 'subido-1' },
      { type: 'text', text: 'Llena los anexos.' },
    ]);

    expect(r.archivos.map((a) => a.nombre)).toEqual([
      'lleno_6.docx',
      'informe.json',
    ]);
    expect(r.archivos[0].datos.toString()).toBe('contenido de f-lleno');
    expect(r.texto).toBe('Listo.');
    expect(r.motivo).toBe('end_turn');
    expect(r.uso).toEqual({
      entrada: 1_000,
      salida: 500,
      cacheEscrita: 2_000,
      cacheLeida: 10_000,
    });
    // Lo subido y lo entregado se borran de Anthropic.
    expect(archivos.delete.mock.calls.map(([id]) => id).sort()).toEqual([
      'f-informe',
      'f-lleno',
      'subido-1',
    ]);
  });

  it('un trabajo pausado se retoma en el mismo contenedor con lo que llevaba, y los tokens se suman', async () => {
    const pausa = [entrega('f-lleno')];
    const { cliente, pedidos } = clienteDePrueba([
      respuesta('pause_turn', pausa),
      respuesta('end_turn', [entrega('f-informe')], { input_tokens: 3_000 }),
    ]);

    const r = await trabajarEnElTaller(cliente, PEDIDO);

    expect(pedidos).toHaveLength(2);
    expect(pedidos[1].container).toEqual({
      id: 'contenedor-1',
      skills: [HABILIDAD_DE_WORD],
    });
    expect(pedidos[1].messages[1]).toEqual({
      role: 'assistant',
      content: pausa,
    });
    expect(r.archivos.map((a) => a.nombre).sort()).toEqual([
      'informe.json',
      'lleno_6.docx',
    ]);
    expect(r.uso.entrada).toBe(4_000);
    expect(r.uso.salida).toBe(1_000);
  });

  it('si la API falla, lanza, pero igual borra lo que había subido', async () => {
    const { cliente, archivos } = clienteDePrueba([new Error('se cortó')]);
    await expect(trabajarEnElTaller(cliente, PEDIDO)).rejects.toThrow(
      'se cortó',
    );
    expect(archivos.delete).toHaveBeenCalledWith('subido-1');
  });

  it('solo cuenta como entregado lo que salió bien de $OUTPUT_DIR', () => {
    expect(
      archivosEntregados([
        entrega('a', 'b'),
        {
          type: 'bash_code_execution_tool_result',
          tool_use_id: 'x',
          content: {
            type: 'bash_code_execution_tool_result_error',
            error_code: 'unavailable',
          },
        },
        {
          type: 'code_execution_tool_result',
          tool_use_id: 'y',
          content: {
            type: 'code_execution_result',
            stdout: '',
            stderr: '',
            return_code: 0,
            content: [{ type: 'code_execution_output', file_id: 'c' }],
          },
        },
      ] as unknown as Anthropic.ContentBlock[]),
    ).toEqual(['a', 'b', 'c']);
  });
});
