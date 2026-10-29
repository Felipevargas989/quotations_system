import { Controller, Get, Post, Query } from '@nestjs/common';
import { Derecho } from 'src/auth/derecho.decorator';
import { ADMIN_ONLY, Roles } from 'src/auth/roles.decorator';
import { type Fuente, FUENTES, MESES_DE_HISTORIA } from './datos-abiertos';
import { DURACION_DE_LA_CARGA_MS } from './datos-abiertos-cron.service';
import { DatosAbiertosRepository } from './datos-abiertos.repository';
import { DatosAbiertosService } from './datos-abiertos.service';

// La carga del mercado a mano (decisión 101 del doc 17): para probarla en el
// laboratorio, donde los relojes no corren, y para no esperar a la noche.
// Solo administrador, como el radar a mano.
@Roles(...ADMIN_ONLY)
@Derecho('oportunidades')
@Controller('oportunidades/mercado')
export class DatosAbiertosController {
  constructor(
    private readonly datosAbiertos: DatosAbiertosService,
    private readonly repo: DatosAbiertosRepository,
  ) {}

  /** Arranca la carga y responde al tiro. `meses`: cuántos hacia atrás;
   *  `fuentes`: cuáles, separadas por coma (por omisión, todas). */
  @Post('cargar')
  cargar(@Query('meses') meses?: string, @Query('fuentes') fuentes?: string) {
    const n = Number.parseInt(meses ?? '', 10);
    const elegidas = (fuentes ?? '')
      .split(',')
      .map((f) => f.trim())
      .filter((f): f is Fuente => (FUENTES as readonly string[]).includes(f));
    const iniciada = this.datosAbiertos.iniciar({
      hasta: Date.now() + DURACION_DE_LA_CARGA_MS,
      meses: Number.isFinite(n)
        ? Math.min(Math.max(n, 1), MESES_DE_HISTORIA)
        : MESES_DE_HISTORIA,
      fuentes: elegidas,
      origen: 'manual',
    });
    return iniciada
      ? { iniciada: true }
      : { iniciada: false, motivo: 'Ya hay una carga del mercado en marcha.' };
  }

  /** Qué mes de qué archivo está cargado, y si hay una carga en marcha. */
  @Get('cargas')
  async cargas() {
    return {
      en_marcha: this.datosAbiertos.enMarcha,
      cargas: await this.repo.cargas(),
    };
  }
}
