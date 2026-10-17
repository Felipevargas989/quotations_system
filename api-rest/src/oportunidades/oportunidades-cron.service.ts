import { Injectable, OnApplicationBootstrap } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { RadarService } from './radar.service';

// EL RELOJ DEL RADAR (doc 17 §5.1): cada 2 horas, a los 7 minutos para no
// chocar con los relojes de la hora en punto. Como todos los relojes de la
// casa, solo corre con NODE_ENV=production (app.module.ts).
//
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

  @Cron('7 */2 * * *')
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
