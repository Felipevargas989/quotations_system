import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { RadarService } from './radar.service';

// EL RELOJ DEL RADAR (doc 17 §5.1, decisión 18): en hora de Chile, a los 7
// minutos para no chocar con los relojes de la hora en punto. Felipe, 17-10:
// "nada se mueve después de las 18:00, sistema público".
//  - De día, en horario de oficina: 09, 12, 15 y 18 h. Lo nuevo y los
//    cambios; la de las 18 recoge lo publicado en la tarde.
//  - De noche: 23, 02 y 05 h. Lo mismo y además la historia de 3 años, que
//    HistoriaService solo carga entre las 22:00 y las 07:00 (lo que pide
//    ChileCompra para las descargas grandes).
// Tres horas o más entre una y otra: una corrida dura a lo más unas 2,5 horas
// y nunca encuentra a la anterior con el candado puesto. Es el único reloj de
// la casa con zona horaria (los demás suponen UTC, mapa 16): así no se corre
// con el cambio de hora. Como todos, solo corre con NODE_ENV=production
// (app.module.ts).
export const HORARIO_DEL_RADAR = '7 2,5,9,12,15,18,23 * * *';
export const ZONA_DEL_RADAR = 'America/Santiago';

const MINUTO = 60_000;

const RELOJ_DE_CHILE = new Intl.DateTimeFormat('en-US', {
  timeZone: ZONA_DEL_RADAR,
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

const enChile = (instante: number) => {
  const partes = RELOJ_DE_CHILE.formatToParts(new Date(instante));
  const valor = (tipo: string) =>
    Number(partes.find((p) => p.type === tipo)?.value);
  return { hora: valor('hour'), minuto: valor('minute') };
};

/** LA GRAN DESCARGA (19-10, decisión 28). Felipe: *"hagamos una gran carga
 *  esta noche y después sigamos con el flujo regular"*. Hasta cuándo puede
 *  cargar historia una pasada que parte en `instante`: 10 minutos antes de
 *  la pasada siguiente, y nunca después de las 06:55, porque ChileCompra
 *  pide las descargas grandes entre las 22:00 y las 07:00. */
export const historiaHasta = (instante: number): number => {
  const [minutoDelReloj, horas] = HORARIO_DEL_RADAR.split(' ');
  const delReloj = horas.split(',').map(Number);
  const desde = Math.floor(instante / MINUTO) * MINUTO;
  for (let t = desde + MINUTO; t <= desde + 24 * 60 * MINUTO; t += MINUTO) {
    const { hora, minuto } = enChile(t);
    if (hora === 7 && minuto === 0) return t - 5 * MINUTO;
    if (delReloj.includes(hora) && minuto === Number(minutoDelReloj)) {
      return t - 10 * MINUTO;
    }
  }
  return desde;
};

// La palanca del laboratorio, igual que RUN_FOLLOWUPS_ON_BOOT:
// OPORTUNIDADES_RADAR_AL_ARRANCAR=1 corre el radar una vez, un minuto
// después de encender, en cualquier ambiente. Correrlo de nuevo no duplica
// nada (solo trae y lee lo que no está), pero cada encendido gasta una
// consulta a Mercado Público: retirar la variable cuando ya no se necesite.
@Injectable()
export class OportunidadesCronService implements OnApplicationBootstrap {
  constructor(
    private readonly radar: RadarService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(OportunidadesCronService.name);
  }

  @Cron(HORARIO_DEL_RADAR, { timeZone: ZONA_DEL_RADAR })
  async radarProgramado() {
    try {
      await this.radar.correr('reloj', historiaHasta(Date.now()));
    } catch (error) {
      this.logger.error(`el reloj del radar falló: ${mensajeDe(error)}`);
    }
  }

  onApplicationBootstrap() {
    // Siempre, en cualquier ambiente: una corrida que quedó a medias con el
    // reinicio no puede seguir teniendo el candado.
    const encendido = new Date().toISOString();
    const limpieza = this.radar.limpiarAlEncender(encendido);

    if (process.env.OPORTUNIDADES_RADAR_AL_ARRANCAR !== '1') return;
    this.logger.warn(
      'OPORTUNIDADES_RADAR_AL_ARRANCAR=1: el radar corre en un minuto',
    );
    setTimeout(() => {
      limpieza
        .then(() => this.radar.iniciar('arranque'))
        .catch((error) => {
          this.logger.error(
            `el radar de arranque no partió: ${mensajeDe(error)}`,
          );
        });
    }, 60_000);
  }
}
