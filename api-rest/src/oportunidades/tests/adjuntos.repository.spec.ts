import type { PinoLogger } from 'nestjs-pino';
import { BUCKET_PRIVADO } from 'src/storage/storage.service';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import { AdjuntosRepository } from '../adjuntos/adjuntos.repository';

/**
 * El repositorio de adjuntos contra una base falsa que anota cada consulta
 * (tabla y pasos) y cada movimiento del balde. Lo que fija: toda consulta
 * filtra por la empresa, y los archivos van al balde privado.
 */
type Consulta = { tabla: string; pasos: unknown[][] };

const METODOS = [
  'select',
  'insert',
  'update',
  'delete',
  'eq',
  'in',
  'order',
  'limit',
];

/** Con varias respuestas, una por consulta en orden (la última se repite). */
function armar(
  respuesta:
    | { data?: unknown; error?: unknown }
    | Array<{ data?: unknown; error?: unknown }> = {},
) {
  const respuestas = Array.isArray(respuesta) ? respuesta : [respuesta];
  let vez = 0;
  const consultas: Consulta[] = [];
  const from = jest.fn((tabla: string) => {
    const consulta: Consulta = { tabla, pasos: [] };
    consultas.push(consulta);
    const suya = respuestas[Math.min(vez++, respuestas.length - 1)];
    const resolver = () =>
      Promise.resolve({ data: null, error: null, ...suya });
    const cadena: Record<string, unknown> = {};
    for (const m of METODOS) {
      cadena[m] = (...args: unknown[]) => {
        consulta.pasos.push([m, ...args]);
        return cadena;
      };
    }
    cadena.single = () => resolver();
    cadena.maybeSingle = () => resolver();
    cadena.then = (
      bien: (v: unknown) => unknown,
      mal?: (e: unknown) => unknown,
    ) => resolver().then(bien, mal);
    return cadena;
  });
  const balde = {
    upload: jest.fn().mockResolvedValue({ error: null }),
    remove: jest.fn().mockResolvedValue({ error: null }),
  };
  const storage = { from: jest.fn(() => balde) };
  const repo = new AdjuntosRepository(
    { client: { from, storage } } as unknown as SupabaseService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, consultas, storage, balde };
}

const filtros = (c: Consulta) =>
  c.pasos.filter(([m]) => m === 'eq').map(([, campo, valor]) => [campo, valor]);

describe('AdjuntosRepository — cada consulta es de UNA empresa', () => {
  it('¿es de la empresa?: oportunidad por empresa e id', async () => {
    const { repo, consultas } = armar({ data: { id: 9 } });
    await expect(repo.esDeLaEmpresa(1, 9)).resolves.toBe(true);
    expect(consultas[0].tabla).toBe('oportunidades');
    expect(filtros(consultas[0])).toEqual([
      ['company_id', 1],
      ['id', 9],
    ]);
  });

  it('el perfil de la sesión se busca por user_id (la cuenta) y en la empresa', async () => {
    const { repo, consultas } = armar({ data: { id: 'perfil-7' } });
    await expect(repo.perfilDe(1, 'cuenta-3')).resolves.toBe('perfil-7');
    expect(consultas[0].tabla).toBe('user_profiles');
    expect(filtros(consultas[0])).toEqual([
      ['company_id', 1],
      ['user_id', 'cuenta-3'],
    ]);
  });

  it('listar filtra por empresa, oportunidad y sección', async () => {
    const { repo, consultas } = armar({ data: [] });
    await repo.listar(1, 9, 'postulacion');
    expect(consultas[0].tabla).toBe('oportunidad_adjuntos');
    expect(filtros(consultas[0])).toEqual([
      ['company_id', 1],
      ['oportunidad_id', 9],
      ['seccion', 'postulacion'],
    ]);
  });

  it('los orígenes de varias oportunidades: de la empresa y sin rutas', async () => {
    const { repo, consultas } = armar({ data: [] });
    await repo.origenesDe(1, [40, 87]);
    expect(filtros(consultas[0])).toEqual([['company_id', 1]]);
    expect(consultas[0].pasos).toContainEqual([
      'in',
      'oportunidad_id',
      [40, 87],
    ]);
    expect(consultas[0].pasos[0]).toEqual([
      'select',
      'id, oportunidad_id, seccion, origen, viene_de',
    ]);
    consultas.length = 0;
    await expect(repo.origenesDe(1, [])).resolves.toEqual([]);
    expect(consultas).toHaveLength(0);
  });

  it('borrar la fila exige empresa, oportunidad e id', async () => {
    const { repo, consultas } = armar({ data: { ruta: 'c1/x' } });
    await expect(repo.borrarFila(1, 9, 7)).resolves.toEqual({ ruta: 'c1/x' });
    expect(consultas[0].pasos[0]).toEqual(['delete']);
    expect(filtros(consultas[0])).toEqual([
      ['company_id', 1],
      ['oportunidad_id', 9],
      ['id', 7],
    ]);
  });
});

describe('AdjuntosRepository — el balde', () => {
  it('sube al balde privado, sin pisar nada', async () => {
    const { repo, storage, balde } = armar();
    await repo.subirArchivo(
      'c1/oportunidades/9/a.pdf',
      Buffer.from('x'),
      'application/pdf',
    );
    expect(storage.from).toHaveBeenCalledWith(BUCKET_PRIVADO);
    expect(balde.upload).toHaveBeenCalledWith(
      'c1/oportunidades/9/a.pdf',
      expect.any(Buffer),
      { contentType: 'application/pdf', upsert: false },
    );
  });

  it('si el balde no recibe, es un error (no una subida a medias)', async () => {
    const { repo, balde } = armar();
    balde.upload.mockResolvedValue({ error: new Error('lleno') });
    await expect(
      repo.subirArchivo('c1/x.pdf', Buffer.from('x'), 'application/pdf'),
    ).rejects.toThrow('lleno');
  });

  it('borrar del balde dice si se pudo', async () => {
    const { repo, balde } = armar();
    await expect(repo.borrarArchivo('c1/x.pdf')).resolves.toBe(true);
    balde.remove.mockResolvedValue({ error: new Error('no') });
    await expect(repo.borrarArchivo('c1/x.pdf')).resolves.toBe(false);
  });

  it('«Volver a armar» (decisión 49): borra solo borradores de la IA sin firmar, de la empresa y la oportunidad, con su archivo', async () => {
    const { repo, consultas, storage, balde } = armar([
      // El 63 ya tiene su firmado: no se toca.
      { data: [{ viene_de: 63 }] },
      { data: [{ ruta: 'c1/oportunidades/84/postulacion/x_64.docx' }] },
    ]);
    await expect(repo.borrarBorradores(1, 84, [63, 64])).resolves.toBe(1);
    const [firmados, borrado] = consultas;
    expect(filtros(firmados)).toEqual([
      ['company_id', 1],
      ['oportunidad_id', 84],
      ['origen', 'firmado'],
    ]);
    expect(borrado.pasos).toContainEqual(['delete']);
    expect(filtros(borrado)).toEqual([
      ['company_id', 1],
      ['oportunidad_id', 84],
      ['seccion', 'postulacion'],
      ['origen', 'generado'],
    ]);
    expect(borrado.pasos).toContainEqual(['in', 'id', [64]]);
    expect(storage.from).toHaveBeenCalledWith(BUCKET_PRIVADO);
    expect(balde.remove).toHaveBeenCalledWith([
      'c1/oportunidades/84/postulacion/x_64.docx',
    ]);
  });

  it('sin nada que borrar no consulta; si todos tienen firmado, no borra', async () => {
    const vacio = armar();
    await expect(vacio.repo.borrarBorradores(1, 84, [])).resolves.toBe(0);
    expect(vacio.consultas).toHaveLength(0);
    const firmados = armar([{ data: [{ viene_de: 63 }] }]);
    await expect(firmados.repo.borrarBorradores(1, 84, [63])).resolves.toBe(0);
    expect(firmados.consultas).toHaveLength(1);
  });
});

describe('Se firma y se borra (decisión 58)', () => {
  it('los pares: cada firmado con el Word del que salió, si ese Word sigue ahí', async () => {
    const { repo, consultas } = armar({
      data: [
        {
          id: 64,
          nombre: 'Formulario N°5 - lleno.docx',
          ruta: 'r/64.docx',
          origen: 'generado',
          viene_de: 54,
          generacion_id: 9,
        },
        {
          id: 65,
          nombre: 'Formulario N°5 - firmado.pdf',
          ruta: 'r/65.pdf',
          origen: 'firmado',
          viene_de: 64,
          generacion_id: 15,
        },
        // Ya quedó solo: su Word se borró al firmar.
        {
          id: 77,
          nombre: 'Formulario N°3 - firmado.pdf',
          ruta: 'r/77.pdf',
          origen: 'firmado',
          viene_de: 54,
          generacion_id: 9,
        },
      ],
    });
    await expect(repo.paresFirmados(1, 84)).resolves.toEqual([
      {
        firmado: { id: 65, ruta: 'r/65.pdf' },
        word: { id: 64, ruta: 'r/64.docx', viene_de: 54, generacion_id: 9 },
      },
    ]);
    expect(filtros(consultas[0])).toEqual([
      ['company_id', 1],
      ['oportunidad_id', 84],
      ['seccion', 'postulacion'],
    ]);
  });

  it('el PDF toma el archivo del comprador y la corrida de su Word; después se borran el Word y su archivo', async () => {
    const { repo, consultas, balde } = armar([
      { data: null },
      { data: [{ ruta: 'r/64.docx' }] },
    ]);
    await expect(
      repo.dejarSoloElPdf(1, 84, [
        {
          firmado: { id: 65, ruta: 'r/65.pdf' },
          word: { id: 64, ruta: 'r/64.docx', viene_de: 54, generacion_id: 9 },
        },
      ]),
    ).resolves.toBe(1);
    const [tomar, borrar] = consultas;
    expect(tomar.pasos).toContainEqual([
      'update',
      { viene_de: 54, generacion_id: 9 },
    ]);
    expect(filtros(tomar)).toEqual([
      ['company_id', 1],
      ['oportunidad_id', 84],
      ['origen', 'firmado'],
      ['id', 65],
    ]);
    expect(borrar.pasos).toContainEqual(['delete']);
    expect(borrar.pasos).toContainEqual([
      'in',
      'origen',
      ['generado', 'subido'],
    ]);
    expect(filtros(borrar)).toEqual([
      ['company_id', 1],
      ['oportunidad_id', 84],
      ['seccion', 'postulacion'],
      ['id', 64],
    ]);
    expect(balde.remove).toHaveBeenCalledWith(['r/64.docx']);
  });
});
