import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import { esDeNocheEnChile } from '../historia/historia.service';
import {
  historiaHasta,
  OportunidadesCronService,
} from '../oportunidades-cron.service';
import type { RadarService } from '../radar.service';

describe('El horario del radar (Felipe, 17-10: cuatro de día y tres de noche)', () => {
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

  it('en hora de Chile, a los :07: 09, 12, 15 y 18 de día; 23, 02 y 05 de noche', () => {
    expect(reloj).toEqual({
      cronTime: '7 2,5,9,12,15,18,23 * * *',
      timeZone: 'America/Santiago',
    });
  });

  it('solo las de noche cargan la historia (22:00 a 07:00)', () => {
    // 20-10-2026: Chile en horario de verano (UTC-3); 10 minutos después
    // de partir, cuando la corrida llega a la historia o antes.
    const enChile = (hora: number) => Date.UTC(2026, 9, 20, hora + 3, 17);
    expect(horas.filter((h) => esDeNocheEnChile(enChile(h)))).toEqual([
      2, 5, 23,
    ]);
  });

  it('tres horas o más entre una y otra: una corrida (2,5 h a lo más) no pisa la siguiente', () => {
    const separaciones = horas.map(
      (h, i) => (horas[(i + 1) % horas.length] - h + 24) % 24,
    );
    expect(Math.min(...separaciones)).toBeGreaterThanOrEqual(3);
  });
});

describe('La gran descarga: hasta cuándo carga historia cada pasada de noche (19-10, decisión 28)', () => {
  // Octubre de 2026: Chile en horario de verano (UTC-3).
  const chile = (dia: number, hora: number, minuto: number) =>
    Date.UTC(2026, 9, dia, hora + 3, minuto);

  it('10 minutos antes de la pasada siguiente; la de las 05 hasta las 06:55 (ChileCompra: descargas grandes de 22:00 a 07:00)', () => {
    expect(historiaHasta(chile(19, 23, 7))).toBe(chile(20, 1, 57));
    expect(historiaHasta(chile(20, 2, 7) + 30_000)).toBe(chile(20, 4, 57));
    expect(historiaHasta(chile(20, 5, 7))).toBe(chile(20, 6, 55));
  });

  it('el reloj le pasa esa hora a la corrida', async () => {
    const radar = { correr: jest.fn().mockResolvedValue(null) };
    const cron = new OportunidadesCronService(
      radar as unknown as RadarService,
      mockPinoLogger() as unknown as PinoLogger,
    );
    await cron.radarProgramado();
    expect(radar.correr).toHaveBeenCalledWith('reloj', expect.any(Number));
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
