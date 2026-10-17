import type { PinoLogger } from 'nestjs-pino';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import { OferenteRepository } from '../oferente/oferente.repository';

/** El repositorio del oferente contra una base falsa que anota cada
 *  consulta: toda consulta es de UNA empresa. */
type Consulta = { tabla: string; pasos: unknown[][] };

const METODOS = ['select', 'insert', 'upsert', 'delete', 'eq', 'order'];

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
  const repo = new OferenteRepository(
    { client: { from } } as unknown as SupabaseService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, consultas };
}

const filtros = (c: Consulta) =>
  c.pasos.filter(([m]) => m === 'eq').map(([, campo, valor]) => [campo, valor]);

describe('OferenteRepository', () => {
  it('el oferente y sus documentos se piden por empresa', async () => {
    const { repo, consultas } = armar({ data: [] });
    await repo.oferente(1);
    await repo.documentos(1);
    expect(consultas.map((c) => c.tabla)).toEqual([
      'oportunidades_oferente',
      'oportunidades_documentos',
    ]);
    expect(filtros(consultas[0])).toEqual([['company_id', 1]]);
    expect(filtros(consultas[1])).toEqual([['company_id', 1]]);
  });

  it('guardar es un upsert por empresa con la empresa en la fila', async () => {
    const { repo, consultas } = armar();
    await repo.guardar(1, { razon_social: 'X' });
    const [, fila, opciones] = consultas[0].pasos[0] as [
      string,
      Record<string, unknown>,
      unknown,
    ];
    expect(fila).toMatchObject({ company_id: 1, razon_social: 'X' });
    expect(opciones).toEqual({ onConflict: 'company_id' });
  });

  it('borrar un documento exige la empresa y el id', async () => {
    const { repo, consultas } = armar({ data: { ruta: 'c1/x' } });
    await expect(repo.borrarDocumento(1, 3)).resolves.toEqual({
      ruta: 'c1/x',
    });
    expect(filtros(consultas[0])).toEqual([
      ['company_id', 1],
      ['id', 3],
    ]);
  });

  it('lo de Configuración de empresa se lee por id de la empresa', async () => {
    const { repo, consultas } = armar({ data: { name: 'Valle del Sol' } });
    await repo.empresa(1);
    expect(consultas[0].tabla).toBe('companies');
    expect(filtros(consultas[0])).toEqual([['id', 1]]);
  });
});
