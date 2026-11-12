import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { LicifyService } from '../adjuntos/licify.service';
import { FichaRepository } from '../ficha/ficha.repository';
import { VERSION_DE_LAS_INSTRUCCIONES } from '../lectura-corta/lectura-corta';
import { LecturaCortaService } from '../lectura-corta/lectura-corta.service';
import { AnalisisService } from './analisis.service';
import { MODELO_HAIKU } from './comun';

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
// Y LAS NUEVAS SE LEEN SOLAS DESPUÉS DE CADA PASADA DEL RADAR. Desde la
// decisión 129 (11-11) se les hacía lo mismo que el «Me interesa», con
// Opus. Desde la 132 (12-11) se les hace la LECTURA CORTA con Haiku:
// Felipe no quiere gastar los dólares del motor en leer bases ("intentemos
// hacerlo con un modelo barato, una lectura que diga ¿es para mí o no es
// para mí?"). Se traen los documentos, Haiku contesta y la oportunidad
// queda como la deja el análisis (decisión 21): «no es para ti», roja y en
// ese montón de la bandeja; «es para ti» o «dudoso», en «Por revisar» con
// «Bases leídas». El análisis completo de Opus queda para el «Me interesa»
// y su botón.

/** CON QUÉ MODELO SE LEEN SOLAS LAS NUEVAS: una sola constante, para subir
 *  el flujo con Haiku o con Sonnet según salga la prueba de la decisión 132
 *  sin tocar más código. Medido con las mismas 81 bases: Haiku, unos
 *  US$0,003 por base; Sonnet, unos US$0,056. */
export const MODELO_DE_LA_LECTURA_SOLA: string = MODELO_HAIKU;
/** Por pasada del radar: con Haiku, unos centavos; con Sonnet, unos US$2. */
export const MAX_LECTURAS_SOLAS_POR_PASADA = 40;
/** Las que se intentan por pasada, contando las que no tienen bases. */
const MAX_INTENTOS_POR_PASADA = 2 * MAX_LECTURAS_SOLAS_POR_PASADA;
/** Lo que cierra antes ya no alcanza a postularse: no se gasta en eso. */
export const MARGEN_PARA_PREPARAR_MS = 3 * 60 * 60 * 1000;
/** Lo que no se pudo (sin bases que leer, o pesan de más) se vuelve a
 *  intentar al día siguiente, no en cada pasada. */
const REINTENTAR_MS = 24 * 60 * 60 * 1000;
/** Toda la vuelta: nunca alcanza a la pasada siguiente (hay tres horas o
 *  más entre una y otra). */
const PRESUPUESTO_MS = 60 * 60 * 1000;
/** Sin sesión: el perfil queda vacío, así `subido_por` y `pedido_por` dicen
 *  que no lo pidió nadie y «estudiada» no lo cuenta (migración 205). */
export const SIN_SESION = '';

@Injectable()
export class PrepararLaLicitacionService {
  private preparando = false;
  /** empresa:oportunidad → cuándo se intentó leerla sola. */
  private readonly intentadas = new Map<string, number>();

  constructor(
    private readonly licify: LicifyService,
    private readonly analisis: AnalisisService,
    private readonly logger: PinoLogger,
    private readonly ficha: FichaRepository,
    private readonly lecturaCorta: LecturaCortaService,
  ) {
    this.logger.setContext(PrepararLaLicitacionService.name);
  }

  /** Nunca lanza: corre por detrás del «Me interesa». `cuentaId` es el id
   *  de la sesión, el mismo que piden los dos botones. true = el análisis
   *  partió. */
  async preparar(
    companyId: number,
    cuentaId: string,
    oportunidadId: number,
  ): Promise<boolean> {
    // Si la empresa ya los está trayendo a mano, esa vuelta manda: analizar
    // ahora leería las bases a medio llegar.
    if (this.licify.estaTrayendo(companyId, oportunidadId)) return false;
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
      if (ultimo && ultimo.estado !== 'error') return false;
      await this.analisis.pedir(companyId, cuentaId, oportunidadId);
      return true;
    } catch (error) {
      this.logger.info(
        `me interesa ${oportunidadId}: el análisis no partió solo: ${mensajeDe(error)}`,
      );
      return false;
    }
  }

  /** LAS NUEVAS VERDES Y AMARILLAS, SOLAS (decisiones 129 y 132): las
   *  llama el radar al terminar una pasada buena. De la que cierra antes a
   *  la que cierra después, con tope por pasada; una vuelta a la vez. A cada
   *  una le trae los documentos sin sesión y le hace la lectura corta con
   *  Haiku; lo que dice queda en la oportunidad. Sin Licify no hay bases que
   *  traer y sin la llave de Anthropic no hay lectura: no hace nada. Nunca
   *  lanza; devuelve cuántas se leyeron. */
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
    const lote = `radar ${new Date().toISOString()} ${VERSION_DE_LAS_INSTRUCCIONES}`;
    let leidas = 0;
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
            leidas >= MAX_LECTURAS_SOLAS_POR_PASADA ||
            intentos >= MAX_INTENTOS_POR_PASADA ||
            Date.now() > hasta
          ) {
            return leidas;
          }
          const clave = `${companyId}:${id}`;
          if (this.intentadas.has(clave)) continue;
          if (this.licify.estaTrayendo(companyId, id)) continue;
          this.intentadas.set(clave, Date.now());
          intentos++;
          if (await this.leerSola(companyId, id, lote)) leidas++;
        }
      }
    } catch (error) {
      this.logger.warn(`las que se leen solas: ${mensajeDe(error)}`);
    } finally {
      this.preparando = false;
      if (intentos > 0) {
        this.logger.info(
          `se leyeron solas: ${intentos} intentadas, ${leidas} con veredicto`,
        );
      }
    }
    return leidas;
  }

  /** Una: trae los documentos, la lee con Haiku y deja lo que dijo en la
   *  oportunidad. true = hubo veredicto. */
  private async leerSola(
    companyId: number,
    id: number,
    lote: string,
  ): Promise<boolean> {
    try {
      await this.licify.traer(companyId, SIN_SESION, id);
    } catch (error) {
      this.logger.warn(
        `leída sola ${id}: no se trajeron los documentos: ${mensajeDe(error)}`,
      );
    }
    const lectura = await this.lecturaCorta.leerUna(companyId, id, lote, {
      origen: 'radar',
      modelo: MODELO_DE_LA_LECTURA_SOLA,
    });
    if (!lectura) return false;
    try {
      await this.ficha.marcarSegunLaLecturaCorta(companyId, id, lectura);
      return true;
    } catch (error) {
      // La lectura quedó en su tabla; la oportunidad, sin marcar: mañana
      // se vuelve a intentar.
      this.logger.warn(
        `leída sola ${id}: no se pudo marcar la oportunidad: ${mensajeDe(error)}`,
      );
      return false;
    }
  }
}
