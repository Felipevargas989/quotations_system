import type { PinoLogger } from 'nestjs-pino';
import type { SupabaseService } from 'src/supabase/supabase.service';
import { mockPinoLogger } from 'src/testing/mocks';
import { PostulacionRepository } from '../postulacion/postulacion.repository';

// LA OFERTA DE LA COTIZACIÓN (decisión 69, 22-10, el catamarán). Desde la
// decisión 33, «Armar postulación» guarda la oferta y DESPUÉS la propuesta
// técnica, que no trae oferta: si se tomaba la más nueva de las dos, la
// cotización no encontraba los productos y escondía el botón. Lo que fija:
// se busca la más nueva QUE TRAIGA oferta, de la empresa y la oportunidad.

type Paso = [string, ...unknown[]];

function armar(fila: unknown = { id: 27, resultado: { oferta: {} } }) {
  const pasos: Paso[] = [];
  const cadena: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'not', 'order', 'limit']) {
    cadena[m] = (...args: unknown[]) => {
      pasos.push([m, ...args]);
      return cadena;
    };
  }
  cadena.then = (bien: (v: unknown) => unknown) =>
    Promise.resolve({ data: fila ? [fila] : [], error: null }).then(bien);
  const from = jest.fn(() => cadena);
  const repo = new PostulacionRepository(
    { client: { from } } as unknown as SupabaseService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, pasos, from };
}

describe('La oferta de la cotización', () => {
  it('es la más nueva de oferta o propuesta que TRAIGA oferta, de esa empresa y oportunidad', async () => {
    const { repo, pasos, from } = armar();
    const r = await repo.ultimaPropuesta(1, 3219);
    expect(from).toHaveBeenCalledWith('oportunidad_generacion');
    expect(pasos).toEqual(
      expect.arrayContaining([
        ['eq', 'company_id', 1],
        ['eq', 'oportunidad_id', 3219],
        ['in', 'tipo', ['oferta', 'propuesta']],
        ['eq', 'estado', 'listo'],
        ['not', 'resultado->oferta', 'is', null],
        ['order', 'id', { ascending: false }],
        ['limit', 1],
      ]),
    );
    expect(r).toEqual({ id: 27, resultado: { oferta: {} } });
  });

  it('sin ninguna, null', async () => {
    const { repo } = armar(null);
    expect(await repo.ultimaPropuesta(1, 3219)).toBeNull();
  });
});
