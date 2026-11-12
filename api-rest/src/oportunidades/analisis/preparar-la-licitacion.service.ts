import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { LicifyService } from '../adjuntos/licify.service';
import { FichaRepository } from '../ficha/ficha.repository';
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
//
// Y DESDE LA DECISIÓN 129 (sprint 2, 11-11) LAS NUEVAS SE PREPARAN SOLAS.
// Felipe: "de todo lo que marque amarillo o verde leyamos las bases... hay
// un revisor que me dice claramente cuando algo no es para mi". Después de
// cada pasada del radar, las nuevas verdes y amarillas pasan por lo mismo
// que el «Me interesa», sin sesión. Si las bases piden otro lugar, el
// análisis la pinta roja (decisión 21) y la bandeja la deja en «No es para
// ti»; en «Por revisar» queda el descreme.

/** Por pasada del radar: cada análisis de Opus cuesta unos US$0,33. */
export const MAX_ANALISIS_SOLOS_POR_PASADA = 10;
/** Las que se intentan por pasada, contando las que no tienen bases. */
const MAX_INTENTOS_POR_PASADA = 3 * MAX_ANALISIS_SOLOS_POR_PASADA;
/** Lo que cierra antes ya no alcanza a postularse: no se gasta en eso. */
export const MARGEN_PARA_PREPARAR_MS = 3 * 60 * 60 * 1000;
/** Lo que no se pudo (sin bases que leer, o pesan de más) se vuelve a
 *  intentar al día siguiente, no en cada pasada. */
const REINTENTAR_MS = 24 * 60 * 60 * 1000;
/** Toda la vuelta: nunca alcanza a la pasada siguiente (hay tres horas o
 *  más entre una y otra). */
const PRESUPUESTO_MS = 100 * 60 * 1000;
/** Sin sesión: el perfil queda vacío, así `subido_por` y `pedido_por` dicen
 *  que no lo pidió nadie y «estudiada» no lo cuenta (migración 205). */
export const SIN_SESION = '';

@Injectable()
export class PrepararLaLicitacionService {
  /** De a una, esperando cada análisis: Opus con bases largas tarda
   *  minutos, y varios a la vez chocan con el cupo por minuto. */
  espera = { cadaCuantoMs: 15_000, topeMs: 12 * 60 * 1000 };
  private preparando = false;
  /** empresa:oportunidad → cuándo se intentó prepararla sola. */
  private readonly intentadas = new Map<string, number>();

  constructor(
    private readonly licify: LicifyService,
    private readonly analisis: AnalisisService,
    private readonly logger: PinoLogger,
    private readonly ficha: FichaRepository,
  ) {
    this.logger.setContext(PrepararLaLicitacionService.name);
  }

  /** Nunca lanza: corre por detrás del «Me interesa». `cuentaId` es el id
   *  de la sesión, el mismo que piden los dos botones (`SIN_SESION` en las
   *  que se preparan solas). true = el análisis partió. */
  async preparar(
    companyId: number,
    cuentaId: string,
    oportunidadId: number,
    quien = 'me interesa',
  ): Promise<boolean> {
    // Si la empresa ya los está trayendo a mano, esa vuelta manda: analizar
    // ahora leería las bases a medio llegar.
    if (this.licify.estaTrayendo(companyId, oportunidadId)) return false;
    if (this.licify.configurado) {
      try {
        await this.licify.traer(companyId, cuentaId, oportunidadId);
      } catch (error) {
        this.logger.warn(
          `${quien} ${oportunidadId}: no se trajeron los documentos: ${mensajeDe(error)}`,
        );
      }
    }
    try {
      const ultimo = await this.analisis.ultimo(companyId, oportunidadId);
      // Uno listo o en curso no se repite; uno que falló, sí.
      if (ultimo && ultimo.estado !== 'error') return false;
      await this.analisis.pedir(companyId, cuentaId, oportunidadId);
      return true;
    } catch (error) {
      this.logger.info(
        `${quien} ${oportunidadId}: el análisis no partió solo: ${mensajeDe(error)}`,
      );
      return false;
    }
  }

  /** LAS NUEVAS VERDES Y AMARILLAS, SOLAS (decisión 129): las llama el
   *  radar al terminar una pasada buena. De la que cierra antes a la que
   *  cierra después, con tope por pasada; una vuelta a la vez. Sin Licify
   *  no hay bases que traer y sin la llave de Anthropic no hay análisis:
   *  no hace nada. Nunca lanza; devuelve cuántos análisis partieron. */
  async lasNuevas(companyIds: number[]): Promise<number> {
    if (
      this.preparando ||
      !this.licify.configurado ||
      !process.env.ANTHROPIC_API_KEY?.trim()
    ) {
      return 0;
    }
    this.preparando = true;
    const hasta = Date.now() + PRESUPUESTO_MS;
    let analisis = 0;
    let intentos = 0;
    try {
      for (const [clave, cuando] of this.intentadas) {
        if (Date.now() - cuando >= REINTENTAR_MS) this.intentadas.delete(clave);
      }
      for (const companyId of companyIds) {
        const ids = await this.ficha.paraPrepararSolas(
          companyId,
          MARGEN_PARA_PREPARAR_MS,
        );
        for (const id of ids) {
          if (
            analisis >= MAX_ANALISIS_SOLOS_POR_PASADA ||
            intentos >= MAX_INTENTOS_POR_PASADA ||
            Date.now() > hasta
          ) {
            return analisis;
          }
          const clave = `${companyId}:${id}`;
          if (this.intentadas.has(clave)) continue;
          this.intentadas.set(clave, Date.now());
          intentos++;
          if (
            await this.preparar(companyId, SIN_SESION, id, 'preparada sola')
          ) {
            analisis++;
            await this.esperarElAnalisis(companyId, id);
          }
        }
      }
    } catch (error) {
      this.logger.warn(`las que se preparan solas: ${mensajeDe(error)}`);
    } finally {
      this.preparando = false;
      if (intentos > 0) {
        this.logger.info(
          `se prepararon solas: ${intentos} intentadas, ${analisis} análisis`,
        );
      }
    }
    return analisis;
  }

  /** Hasta que el análisis deja de estar en curso, o el tope. */
  private async esperarElAnalisis(
    companyId: number,
    oportunidadId: number,
  ): Promise<void> {
    const tope = Date.now() + this.espera.topeMs;
    while (Date.now() < tope) {
      await new Promise((listo) => setTimeout(listo, this.espera.cadaCuantoMs));
      const ultimo = await this.analisis
        .ultimo(companyId, oportunidadId)
        .catch(() => null);
      if (ultimo?.estado !== 'procesando') return;
    }
  }
}
