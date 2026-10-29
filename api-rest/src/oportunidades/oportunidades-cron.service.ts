import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { RadarService } from './radar.service';

// EL RELOJ DEL RADAR (doc 17 §5.1; decisiones 18 y 109): en hora de Chile, a
// los 7 minutos para no chocar con los relojes de la hora en punto.
// Felipe, 29-10: "una vez en la mañana... a las 8, a las 12 y dos veces en
// la tarde, a las 3 y a las 6. Cuatro revisiones". Medido ese día con 5.792
// compras ágiles de 3 semanas: con 8, 12, 15 y 18 no se pierde ninguna y
// ninguna llega con menos de 6 horas para cerrar; de noche aparecía una o
// ninguna por pasada. Las de las 23, 02 y 05 h existían para la historia
// por la API, que desde la 109 sale de los archivos de ChileCompra.
// Tres horas o más entre una y otra: una corrida dura a lo más unas 2,5 horas
// y nunca encuentra a la anterior con el candado puesto. Es el único reloj de
// la casa con zona horaria (los demás suponen UTC, mapa 16): así no se corre
// con el cambio de hora. Como todos, solo corre con NODE_ENV=production
// (app.module.ts).
export const HORARIO_DEL_RADAR = '7 8,12,15,18 * * *';
export const ZONA_DEL_RADAR = 'America/Santiago';

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
      await this.radar.correr('reloj');
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
