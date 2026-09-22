import { mensajeDe } from '../../logging/mensaje-de-error';
import { conTope } from '../supabase.service';

/**
 * EL TOPE DE TIEMPO HACIA LA BASE y EL MENSAJE LEGIBLE (22-09-2026,
 * seguro 2). Durante la caída del 21/22-09 cada consulta esperó hasta
 * 123 s y los relojes escribían "[object Object]".
 */
describe('el fetch con tope', () => {
  const original = global.fetch;
  afterEach(() => {
    global.fetch = original;
  });

  it('se rinde cuando la base no contesta a tiempo', async () => {
    // El fetch de mentira nunca contesta: solo obedece la señal de
    // cancelación (como un servidor colgado). Dentro de jest la
    // DOMException viene de otro reino, así que se mira por su nombre.
    global.fetch = jest.fn(
      (_entrada: unknown, init?: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(init.signal?.reason as Error),
          );
        }),
    ) as unknown as typeof fetch;

    const f = conTope(30);
    const empezo = Date.now();
    await expect(f('https://base.invalida/rest/v1/x')).rejects.toHaveProperty(
      'name',
      'TimeoutError',
    );
    expect(Date.now() - empezo).toBeLessThan(2000);
  });

  it('deja pasar una respuesta rápida tal cual', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 200 }) as never;
    const r = await conTope(1000)('https://base/rest/v1/x');
    expect(r.status).toBe(200);
  });
});

describe('el mensaje de un error, sea lo que sea', () => {
  it('un Error normal', () => {
    expect(mensajeDe(new Error('se cayó'))).toBe('se cayó');
  });
  it('un error plano de Supabase (antes: [object Object])', () => {
    expect(
      mensajeDe({
        code: 'PGRST003',
        message: 'Timed out acquiring connection from connection pool.',
      }),
    ).toBe('PGRST003: Timed out acquiring connection from connection pool.');
  });
  it('cualquier otra cosa', () => {
    expect(mensajeDe('texto')).toBe('texto');
    expect(mensajeDe({ raro: 1 })).toContain('raro');
  });
});
