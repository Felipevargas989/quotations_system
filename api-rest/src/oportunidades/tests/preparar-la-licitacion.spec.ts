import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { LicifyService } from '../adjuntos/licify.service';
import type { AnalisisService } from '../analisis/analisis.service';
import {
  MARGEN_PARA_PREPARAR_MS,
  MAX_ANALISIS_SOLOS_POR_PASADA,
  PrepararLaLicitacionService,
  SIN_SESION,
} from '../analisis/preparar-la-licitacion.service';
import type { FichaRepository } from '../ficha/ficha.repository';

// «ME INTERESA» DEJA LA LICITACIÓN LISTA PARA TRABAJAR (decisión 114,
// 04-11): trae los documentos y, si no hay análisis, analiza las bases.
// Nunca lanza, porque corre por detrás. Y desde la decisión 129 (11-11) las
// nuevas verdes y amarillas se preparan solas después de cada pasada del
// radar: sin sesión, de a una y con tope.

function armar() {
  const orden: string[] = [];
  const licify = {
    configurado: true,
    estaTrayendo: jest.fn().mockReturnValue(false),
    traer: jest.fn((_empresa: number, _cuenta: string, id: number) => {
      orden.push(`traer ${id}`);
      return Promise.resolve({ disponibles: 3, bajados: [], omitidos: [] });
    }),
  };
  const analisis = {
    ultimo: jest.fn().mockResolvedValue(null),
    pedir: jest.fn((_empresa: number, _cuenta: string, id: number) => {
      orden.push(`pedir ${id}`);
      return Promise.resolve({ id: 5, estado: 'procesando' });
    }),
  };
  const ficha = { paraPrepararSolas: jest.fn().mockResolvedValue([]) };
  const servicio = new PrepararLaLicitacionService(
    licify as unknown as LicifyService,
    analisis as unknown as AnalisisService,
    mockPinoLogger() as unknown as PinoLogger,
    ficha as unknown as FichaRepository,
  );
  // En las pruebas, mirar el análisis no espera 15 segundos.
  servicio.espera = { cadaCuantoMs: 0, topeMs: 5_000 };
  return { licify, analisis, ficha, servicio, orden };
}

describe('PrepararLaLicitacionService (decisión 114)', () => {
  it('trae los documentos y después pide el análisis, con la sesión de quien la marcó', async () => {
    const { licify, analisis, servicio, orden } = armar();
    await expect(servicio.preparar(1, 'sesion-felipe', 40)).resolves.toBe(true);
    expect(orden).toEqual(['traer 40', 'pedir 40']);
    expect(licify.traer).toHaveBeenCalledWith(1, 'sesion-felipe', 40);
    expect(analisis.pedir).toHaveBeenCalledWith(1, 'sesion-felipe', 40);
  });

  it('un análisis listo o en curso no se repite; uno que falló, sí', async () => {
    const { analisis, servicio } = armar();
    analisis.ultimo.mockResolvedValueOnce({ id: 4, estado: 'listo' });
    await servicio.preparar(1, 'sesion-felipe', 40);
    analisis.ultimo.mockResolvedValueOnce({ id: 4, estado: 'procesando' });
    await servicio.preparar(1, 'sesion-felipe', 40);
    expect(analisis.pedir).not.toHaveBeenCalled();
    analisis.ultimo.mockResolvedValueOnce({ id: 4, estado: 'error' });
    await servicio.preparar(1, 'sesion-felipe', 40);
    expect(analisis.pedir).toHaveBeenCalledTimes(1);
  });

  it('si ya los está trayendo a mano, no hace nada: esa vuelta manda', async () => {
    const { licify, analisis, servicio } = armar();
    licify.estaTrayendo.mockReturnValue(true);
    await servicio.preparar(1, 'sesion-felipe', 40);
    expect(licify.traer).not.toHaveBeenCalled();
    expect(analisis.pedir).not.toHaveBeenCalled();
  });

  it('sin Licify no trae, pero analiza lo que ya se subió', async () => {
    const { licify, analisis, servicio } = armar();
    licify.configurado = false;
    await servicio.preparar(1, 'sesion-felipe', 40);
    expect(licify.traer).not.toHaveBeenCalled();
    expect(analisis.pedir).toHaveBeenCalledTimes(1);
  });

  it('si traer falla igual intenta analizar, y si el análisis no parte no lanza', async () => {
    const { licify, analisis, servicio } = armar();
    licify.traer.mockRejectedValueOnce(new Error('Licify respondió 503'));
    analisis.pedir.mockRejectedValueOnce(
      new Error('Sube primero las bases (PDF, Word o Excel).'),
    );
    await expect(servicio.preparar(1, 'sesion-felipe', 40)).resolves.toBe(
      false,
    );
    expect(analisis.pedir).toHaveBeenCalledTimes(1);
  });
});

describe('PrepararLaLicitacionService — las que se preparan solas (decisión 129)', () => {
  const llave = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'llave-de-prueba';
  });
  afterAll(() => {
    if (llave === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = llave;
  });

  it('prepara las nuevas de cada empresa sin sesión y de a una: la siguiente parte cuando terminó el análisis anterior', async () => {
    const { analisis, ficha, servicio, orden } = armar();
    ficha.paraPrepararSolas.mockResolvedValue([40, 41]);
    // Al preparar no hay análisis; al mirar, el primero sigue un rato.
    analisis.ultimo
      .mockResolvedValueOnce(null)
      .mockImplementationOnce(() => {
        orden.push('procesando 40');
        return Promise.resolve({ id: 5, estado: 'procesando' });
      })
      .mockImplementationOnce(() => {
        orden.push('listo 40');
        return Promise.resolve({ id: 5, estado: 'listo' });
      })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 6, estado: 'listo' });

    await expect(servicio.lasNuevas([1])).resolves.toBe(2);

    expect(ficha.paraPrepararSolas).toHaveBeenCalledWith(
      1,
      MARGEN_PARA_PREPARAR_MS,
    );
    expect(orden).toEqual([
      'traer 40',
      'pedir 40',
      'procesando 40',
      'listo 40',
      'traer 41',
      'pedir 41',
    ]);
    expect(analisis.pedir).toHaveBeenCalledWith(1, SIN_SESION, 40);
    expect(analisis.pedir).toHaveBeenCalledWith(1, SIN_SESION, 41);
  });

  it('con tope por pasada: lo que sobra queda para la siguiente', async () => {
    const { analisis, ficha, servicio } = armar();
    ficha.paraPrepararSolas.mockResolvedValue(
      Array.from({ length: 15 }, (_, i) => 100 + i),
    );
    await expect(servicio.lasNuevas([1])).resolves.toBe(
      MAX_ANALISIS_SOLOS_POR_PASADA,
    );
    expect(analisis.pedir).toHaveBeenCalledTimes(MAX_ANALISIS_SOLOS_POR_PASADA);
  });

  it('lo que no tiene bases que leer no se vuelve a intentar en la pasada siguiente', async () => {
    const { licify, analisis, ficha, servicio } = armar();
    ficha.paraPrepararSolas.mockResolvedValue([40]);
    analisis.pedir.mockRejectedValue(
      new Error('Sube primero las bases (PDF, Word o Excel).'),
    );
    await expect(servicio.lasNuevas([1])).resolves.toBe(0);
    await expect(servicio.lasNuevas([1])).resolves.toBe(0);
    expect(licify.traer).toHaveBeenCalledTimes(1);
  });

  it('una vuelta a la vez: si ya está preparando, la otra no parte', async () => {
    const { ficha, servicio } = armar();
    let soltar: (ids: number[]) => void = () => undefined;
    ficha.paraPrepararSolas.mockReturnValue(
      new Promise<number[]>((listo) => {
        soltar = listo;
      }),
    );
    const primera = servicio.lasNuevas([1]);
    await expect(servicio.lasNuevas([1])).resolves.toBe(0);
    soltar([]);
    await expect(primera).resolves.toBe(0);
    expect(ficha.paraPrepararSolas).toHaveBeenCalledTimes(1);
  });

  it('sin Licify o sin la llave de Anthropic no hace nada', async () => {
    const { licify, ficha, servicio } = armar();
    licify.configurado = false;
    await expect(servicio.lasNuevas([1])).resolves.toBe(0);
    licify.configurado = true;
    delete process.env.ANTHROPIC_API_KEY;
    await expect(servicio.lasNuevas([1])).resolves.toBe(0);
    expect(ficha.paraPrepararSolas).not.toHaveBeenCalled();
  });

  it('nunca lanza: si la base falla, lo dice y sigue', async () => {
    const { ficha, servicio } = armar();
    ficha.paraPrepararSolas.mockRejectedValue(new Error('la base no responde'));
    await expect(servicio.lasNuevas([1])).resolves.toBe(0);
    // Y la siguiente vuelta puede partir.
    ficha.paraPrepararSolas.mockResolvedValue([]);
    await expect(servicio.lasNuevas([1])).resolves.toBe(0);
    expect(ficha.paraPrepararSolas).toHaveBeenCalledTimes(2);
  });
});
