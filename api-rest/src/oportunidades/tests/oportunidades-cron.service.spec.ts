import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import { OportunidadesCronService } from '../oportunidades-cron.service';
import type { RadarService } from '../radar.service';

describe('OportunidadesCronService al encender', () => {
  const antes = process.env.OPORTUNIDADES_RADAR_AL_ARRANCAR;

  afterEach(() => {
    jest.useRealTimers();
    if (antes === undefined) delete process.env.OPORTUNIDADES_RADAR_AL_ARRANCAR;
    else process.env.OPORTUNIDADES_RADAR_AL_ARRANCAR = antes;
  });

  const armar = () => {
    const radar = {
      limpiarAlEncender: jest.fn().mockResolvedValue(undefined),
      iniciar: jest.fn().mockResolvedValue(1),
      correr: jest.fn(),
    };
    const cron = new OportunidadesCronService(
      radar as unknown as RadarService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    return { radar, cron };
  };

  it('siempre suelta el candado de una corrida a medias, aunque no corra el radar', () => {
    delete process.env.OPORTUNIDADES_RADAR_AL_ARRANCAR;
    const { radar, cron } = armar();
    cron.onApplicationBootstrap();
    expect(radar.limpiarAlEncender).toHaveBeenCalledTimes(1);
    expect(radar.iniciar).not.toHaveBeenCalled();
  });

  it('con la palanca, corre el radar un minuto después, ya limpio', async () => {
    jest.useFakeTimers();
    process.env.OPORTUNIDADES_RADAR_AL_ARRANCAR = '1';
    const { radar, cron } = armar();
    cron.onApplicationBootstrap();
    expect(radar.iniciar).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(60_000);
    expect(radar.limpiarAlEncender).toHaveBeenCalledTimes(1);
    expect(radar.iniciar).toHaveBeenCalledWith('arranque');
  });
});
