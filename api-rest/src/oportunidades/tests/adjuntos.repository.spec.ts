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

const METODOS = ['select', 'insert', 'delete', 'eq', 'order'];

function armar(respuesta: { data?: unknown; error?: unknown } = {}) {
  const consultas: Consulta[] = [];
  const from = jest.fn((tabla: string) => {
    const consulta: Consulta = { tabla, pasos: [] };
    consultas.push(consulta);
    const resolver = () =>
      Promise.resolve({ data: null, error: null, ...respuesta });
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

  it('listar filtra por empresa y oportunidad', async () => {
    const { repo, consultas } = armar({ data: [] });
    await repo.listar(1, 9);
    expect(consultas[0].tabla).toBe('oportunidad_adjuntos');
    expect(filtros(consultas[0])).toEqual([
      ['company_id', 1],
      ['oportunidad_id', 9],
    ]);
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
});
