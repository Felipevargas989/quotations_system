import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { LicifyService } from '../adjuntos/licify.service';
import type { AnalisisService } from '../analisis/analisis.service';
import { PrepararLaLicitacionService } from '../analisis/preparar-la-licitacion.service';

// «ME INTERESA» DEJA LA LICITACIÓN LISTA PARA TRABAJAR (decisión 114,
// 04-11): trae los documentos y, si no hay análisis, analiza las bases.
// Nunca lanza, porque corre por detrás.

function armar() {
  const orden: string[] = [];
  const licify = {
    configurado: true,
    estaTrayendo: jest.fn().mockReturnValue(false),
    traer: jest.fn(() => {
      orden.push('traer');
      return Promise.resolve({ disponibles: 3, bajados: [], omitidos: [] });
    }),
  };
  const analisis = {
    ultimo: jest.fn().mockResolvedValue(null),
    pedir: jest.fn(() => {
      orden.push('pedir');
      return Promise.resolve({ id: 5, estado: 'procesando' });
    }),
  };
  const servicio = new PrepararLaLicitacionService(
    licify as unknown as LicifyService,
    analisis as unknown as AnalisisService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { licify, analisis, servicio, orden };
}

describe('PrepararLaLicitacionService (decisión 114)', () => {
  it('trae los documentos y después pide el análisis, con la sesión de quien la marcó', async () => {
    const { licify, analisis, servicio, orden } = armar();
    await servicio.preparar(1, 'sesion-felipe', 40);
    expect(orden).toEqual(['traer', 'pedir']);
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
    await expect(
      servicio.preparar(1, 'sesion-felipe', 40),
    ).resolves.toBeUndefined();
    expect(analisis.pedir).toHaveBeenCalledTimes(1);
  });
});
