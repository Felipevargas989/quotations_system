import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import { esDeNocheEnChile } from '../historia/historia.service';
import { OportunidadesCronService } from '../oportunidades-cron.service';
import type { RadarService } from '../radar.service';

describe('El horario del radar (Felipe, 29-10: cuatro revisiones, a las 8, 12, 15 y 18)', () => {
  // Lo que deja @Cron en el método (clave de @nestjs/schedule, que no la
  // exporta desde su índice).
  const reloj = Reflect.getMetadata(
    'SCHEDULE_CRON_OPTIONS',
    OportunidadesCronService.prototype.radarProgramado,
  ) as { cronTime: string; timeZone: string };
  const horas = reloj.cronTime
    .split(' ')[1]
    .split(',')
    .map(Number)
    .sort((a, b) => a - b);

  it('en hora de Chile, a los :07: 08, 12, 15 y 18', () => {
    expect(reloj).toEqual({
      cronTime: '7 8,12,15,18 * * *',
      timeZone: 'America/Santiago',
    });
  });

  it('ninguna de noche: la historia ya no se pide a la API (decisión 109)', () => {
    // 20-10-2026: Chile en horario de verano (UTC-3).
    const enChile = (hora: number) => Date.UTC(2026, 9, 20, hora + 3, 7);
    expect(horas.filter((h) => esDeNocheEnChile(enChile(h)))).toEqual([]);
  });

  it('tres horas o más entre una y otra: una corrida (2,5 h a lo más) no pisa la siguiente', () => {
    const separaciones = horas.map(
      (h, i) => (horas[(i + 1) % horas.length] - h + 24) % 24,
    );
    expect(Math.min(...separaciones)).toBeGreaterThanOrEqual(3);
  });
});

describe('El reloj corre el radar solo con lo vivo (decisión 109)', () => {
  it('sin hora para la historia', async () => {
    const radar = { correr: jest.fn().mockResolvedValue(null) };
    const cron = new OportunidadesCronService(
      radar as unknown as RadarService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    await cron.radarProgramado();
    expect(radar.correr).toHaveBeenCalledWith('reloj');
  });
});

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
