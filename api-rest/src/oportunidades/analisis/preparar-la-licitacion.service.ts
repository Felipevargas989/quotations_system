import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { LicifyService } from '../adjuntos/licify.service';
import { AnalisisService } from './analisis.service';

// «ME INTERESA» DEJA LA LICITACIÓN LISTA PARA TRABAJAR (decisión 114 del
// doc 17, 04-11). Felipe: "el botón de me interesa... debería
// automáticamente traer las bases y hacer el análisis. Creo que apretar
// esos tres botones uno por uno no tiene ningún sentido". Por detrás y sin
// que la pantalla espere: trae lo que publicó el comprador («Traer los
// documentos», decisión 65) y, si quedan bases que leer y todavía no hay
// análisis, las analiza («Analizar bases»). Los dos botones siguen, para
// repetirlo a mano. Lo que falle se ve donde ya se veía: sin documentos,
// «Bases y anexos» sigue pidiendo subirlos; si pesan de más o falta la
// llave, el análisis no parte y queda su botón.

@Injectable()
export class PrepararLaLicitacionService {
  constructor(
    private readonly licify: LicifyService,
    private readonly analisis: AnalisisService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(PrepararLaLicitacionService.name);
  }

  /** Nunca lanza: corre por detrás del «Me interesa». `cuentaId` es el id
   *  de la sesión, el mismo que piden los dos botones. */
  async preparar(
    companyId: number,
    cuentaId: string,
    oportunidadId: number,
  ): Promise<void> {
    // Si la empresa ya los está trayendo a mano, esa vuelta manda: analizar
    // ahora leería las bases a medio llegar.
    if (this.licify.estaTrayendo(companyId, oportunidadId)) return;
    if (this.licify.configurado) {
      try {
        await this.licify.traer(companyId, cuentaId, oportunidadId);
      } catch (error) {
        this.logger.warn(
          `me interesa ${oportunidadId}: no se trajeron los documentos: ${mensajeDe(error)}`,
        );
      }
    }
    try {
      const ultimo = await this.analisis.ultimo(companyId, oportunidadId);
      // Uno listo o en curso no se repite; uno que falló, sí.
      if (ultimo && ultimo.estado !== 'error') return;
      await this.analisis.pedir(companyId, cuentaId, oportunidadId);
    } catch (error) {
      this.logger.info(
        `me interesa ${oportunidadId}: el análisis no partió solo: ${mensajeDe(error)}`,
      );
    }
  }
}
