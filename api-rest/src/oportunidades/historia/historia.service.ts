import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import {
  LecturaDetenida,
  LecturaService,
  type Uso,
} from '../lectura/lectura.service';
import { procesoDesdeLicitacion, regionCalza } from '../mercado-publico/mapeo';
import {
  MercadoPublicoClient,
  MercadoPublicoError,
} from '../mercado-publico/mercado-publico.client';
import type {
  LicitacionDetalle,
  LicitacionListada,
  ProcesoMp,
} from '../mercado-publico/tipos';
import { OportunidadesRepository } from '../oportunidades.repository';
import type { ResumenCorrida } from '../radar.service';
import { bajarActa, leerActa } from './acta';
import { HistoriaRepository, unidadDelCodigo } from './historia.repository';

// SPRINT 1b (doc 17 §5.1, puntos 5 y 6): lo que el radar hace al final de
// cada corrida, con el tiempo que le sobra.
//  - Quién ganó: las licitaciones cerradas de las regiones configuradas se
//    revisan una vez al día hasta que digan el ganador.
//  - La historia: 3 años de licitaciones pasadas, un día a la vez, de noche
//    (o en la corrida de arranque del laboratorio). Solo se pide el detalle
//    de lo que la IA, por el nombre, ve del rubro.
//  - La gran descarga (19-10, decisión 28): de noche la historia sigue
//    hasta la hora que le da el reloj (10 minutos antes de la pasada
//    siguiente, nunca después de las 06:55), y se salta las unidades de
//    compra que ya se sabe que son de otras regiones: ni la IA las lee ni
//    se pide su detalle.
// Las bases y anexos NO se bajan: Mercado Público protege la lista de
// adjuntos con reCAPTCHA (medido el 17-10) y esta casa no lo esquiva.
// APAGADA LA HISTORIA desde la decisión 109 (29-10): la historia de 3 años
// sale de los archivos de ChileCompra (`DatosAbiertosService`), y el radar ya
// no llama a `cargarHistoria` ni pasa de noche. `mp_historia` y lo que bajó
// quedan como estaban; quién ganó lo de la zona (`revisarAdjudicaciones`)
// sigue igual.

const MINUTO = 60 * 1000;

/** Sprint 1b: revisar las cerradas hasta los 80 minutos, y cargar historia
 *  hasta los 130 (siempre bajo las 3 horas en que una corrida se da por
 *  muerta). */
const PRESUPUESTO_ADJUDICACIONES_MS = 80 * MINUTO;
const PRESUPUESTO_HISTORIA_MS = 130 * MINUTO;
/** Con la hora que da el reloj, igual nunca más que esto desde que partió
 *  la corrida: a las 3 horas se da por colgada. */
const TOPE_DE_LA_HISTORIA_MS = 165 * MINUTO;
const MAX_ADJUDICACIONES_POR_CORRIDA = 60;
/** Las seguidas (decisión 30) que se revisan por corrida, como mucho. */
const MAX_SEGUIDAS_POR_CORRIDA = 40;
/** El filtro de la historia lee los nombres de a tantos. */
const NOMBRES_POR_TANDA = 150;

/** ChileCompra pide las descargas grandes entre las 22:00 y las 07:00. Las
 *  corridas de noche del reloj (23, 02 y 05 h) caen aquí; las de día, no. */
export const esDeNocheEnChile = (instante: number): boolean => {
  const hora = Number(
    new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Santiago',
      hour: 'numeric',
      hourCycle: 'h23',
    }).format(new Date(instante)),
  );
  return hora >= 22 || hora < 7;
};

@Injectable()
export class HistoriaService {
  constructor(
    private readonly mp: MercadoPublicoClient,
    private readonly repo: OportunidadesRepository,
    private readonly lectura: LecturaService,
    private readonly unidades: HistoriaRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(HistoriaService.name);
  }

  // ------------------------------------------------------------
  // Sprint 1b: quién ganó (las cerradas de las regiones configuradas)
  // ------------------------------------------------------------
  async revisarAdjudicaciones(
    resumen: ResumenCorrida,
    regiones: string[],
    inicio: number,
  ): Promise<void> {
    const r = resumen.adjudicaciones;
    if (!this.mp.configurado) {
      r.estado = 'sin_ticket';
      return;
    }
    const porRevisar = (await this.repo.procesosPorAdjudicar(300))
      .filter((p) => regionCalza(p.region, regiones))
      .slice(0, MAX_ADJUDICACIONES_POR_CORRIDA);
    // Se guardan también las que siguen sin adjudicar: así su revisión
    // queda fechada y no se vuelven a pedir hasta mañana.
    const lote: ProcesoMp[] = [];
    try {
      for (const { codigo } of porRevisar) {
        if (Date.now() - inicio > PRESUPUESTO_ADJUDICACIONES_MS) {
          r.estado = 'cortada';
          break;
        }
        let detalle;
        try {
          detalle = await this.mp.detalleLicitacion(codigo);
        } catch (error) {
          if (!(error instanceof MercadoPublicoError)) throw error;
          if (error.sinCupo) {
            r.estado = 'cortada';
            resumen.avisos.push(`Adjudicaciones: ${error.message}`);
            break;
          }
          continue;
        }
        const proceso = procesoDesdeLicitacion(detalle);
        if (!proceso) continue;
        r.revisadas++;
        if (proceso.adjudicacion) r.adjudicadas++;
        lote.push(proceso);
      }
    } finally {
      await this.repo.guardarProcesos(lote);
    }
    try {
      await this.revisarSeguidas(resumen, inicio);
    } catch (error) {
      this.logger.warn(`seguidas: ${mensajeDe(error)}`);
      resumen.avisos.push(`Licitaciones seguidas: ${mensajeDe(error)}`);
    }
  }

  /** SEGUIR UNA LICITACIÓN (decisión 30, 19-10): las que una empresa sigue
   *  se revisan una vez al día, de cualquier región y color; cuando
   *  Mercado Público publica el acta, se lee con todas sus ofertas. Cuentan
   *  con las adjudicaciones de la corrida. */
  private async revisarSeguidas(
    resumen: ResumenCorrida,
    inicio: number,
  ): Promise<void> {
    const r = resumen.adjudicaciones;
    const seguidas = await this.unidades.procesosSeguidos(
      MAX_SEGUIDAS_POR_CORRIDA,
    );
    for (const { codigo } of seguidas) {
      if (Date.now() - inicio > PRESUPUESTO_ADJUDICACIONES_MS) return;
      let detalle: LicitacionDetalle | null;
      try {
        detalle = await this.mp.detalleLicitacion(codigo);
      } catch (error) {
        if (!(error instanceof MercadoPublicoError)) throw error;
        if (error.sinCupo) {
          r.estado = 'cortada';
          resumen.avisos.push(`Seguidas: ${error.message}`);
          return;
        }
        continue;
      }
      const proceso = procesoDesdeLicitacion(detalle);
      if (!proceso) continue;
      await this.repo.guardarProcesos([proceso]);
      r.revisadas++;
      if (proceso.adjudicacion) r.adjudicadas++;
      const enlace = detalle?.Adjudicacion?.UrlActa;
      if (!enlace) continue;
      try {
        const acta = leerActa(await bajarActa(enlace));
        if (acta.items.length > 0)
          await this.unidades.guardarActa(codigo, acta);
      } catch (error) {
        this.logger.warn(
          `seguida ${codigo}: no se pudo leer el acta: ${mensajeDe(error)}`,
        );
      }
    }
  }

  // ------------------------------------------------------------
  // Sprint 1b: la historia, un día a la vez (de noche, o en la corrida
  // de arranque del laboratorio)
  // ------------------------------------------------------------
  async cargarHistoria(
    resumen: ResumenCorrida,
    inicio: number,
    origen: 'reloj' | 'manual' | 'arranque',
    opciones: { regiones?: readonly string[]; hasta?: number } = {},
  ): Promise<void> {
    const r = resumen.historia;
    if (!this.mp.configurado) {
      r.estado = 'sin_ticket';
      return;
    }
    if (!this.lectura.configurado) {
      r.estado = 'sin_llave';
      return;
    }
    const toca =
      origen === 'arranque' ||
      (origen === 'reloj' && esDeNocheEnChile(Date.now()));
    if (!toca) {
      r.estado = 'no_toca';
      return;
    }
    const uso: Uso = { entrada: 0, salida: 0 };
    const hasta = Math.min(
      opciones.hasta ?? inicio + PRESUPUESTO_HISTORIA_MS,
      inicio + TOPE_DE_LA_HISTORIA_MS,
    );
    const sinTiempo = () => Date.now() > hasta;
    const deOtraRegion = await this.filtroDeRegiones(opciones.regiones ?? []);
    try {
      while (!sinTiempo()) {
        const fecha = await this.repo.siguienteDiaDeHistoria();
        if (!fecha) {
          r.estado = 'completa';
          return;
        }
        let listo: boolean;
        try {
          listo = await this.unDiaDeHistoria(fecha, resumen, uso, {
            sinTiempo,
            deOtraRegion,
          });
        } catch (error) {
          if (error instanceof LecturaDetenida) throw error;
          // Una falla que no es de Mercado Público ni de la IA (la base, un
          // dato raro) no tumba la corrida entera: el 18-10 un día con una
          // licitación repetida dejó en "error" las dos pasadas de la noche,
          // aunque lo de hoy ya estaba traído y leído. El día queda marcado
          // con su error —la noche siguiente sigue con otro, en vez de
          // chocar siempre con el mismo— y la historia para aquí.
          const mensaje = mensajeDe(error);
          this.logger.error(`historia: el día ${fecha} falló: ${mensaje}`);
          await this.repo.marcarDiaDeHistoria(fecha, {
            estado: 'error',
            error: mensaje.slice(0, 500),
          });
          r.estado = 'falla';
          resumen.avisos.push(
            `Historia: el día ${fecha} falló (${mensaje}); quedó marcado y la historia sigue la próxima noche.`,
          );
          return;
        }
        if (!listo) return;
      }
    } catch (error) {
      if (!(error instanceof LecturaDetenida)) throw error;
      r.estado = 'detenida';
      resumen.avisos.push(error.message);
    } finally {
      resumen.lectura.tokens_entrada += uso.entrada;
      resumen.lectura.tokens_salida += uso.salida;
    }
  }

  /** true = el código es de una unidad de compra que ya se sabe de otras
   *  regiones (decisión 28). Una unidad que no se conoce se pide igual: así
   *  se aprende. Si el mapa no se puede armar, no se filtra nada. */
  private async filtroDeRegiones(
    regiones: readonly string[],
  ): Promise<(codigo: string) => boolean> {
    if (regiones.length === 0) return () => false;
    let unidades: Map<string, string[]>;
    try {
      unidades = await this.unidades.regionesDeLasUnidades();
    } catch (error) {
      this.logger.warn(
        `historia: sin el mapa de unidades, no se filtra por región: ${mensajeDe(error)}`,
      );
      return () => false;
    }
    return (codigo) => {
      const suyas = unidades.get(unidadDelCodigo(codigo));
      return (
        suyas !== undefined &&
        !suyas.some((region) => regionCalza(region, [...regiones]))
      );
    };
  }

  /** Un día de historia. false = hay que parar (sin tiempo, sin cupo o sin
   *  filtro): el día queda pendiente y se retoma en otra corrida (lo ya
   *  guardado no se vuelve a pedir). */
  private async unDiaDeHistoria(
    fecha: string,
    resumen: ResumenCorrida,
    uso: Uso,
    {
      sinTiempo,
      deOtraRegion,
    }: { sinTiempo: () => boolean; deOtraRegion: (codigo: string) => boolean },
  ): Promise<boolean> {
    const r = resumen.historia;
    const [anio, mes, dia] = fecha.split('-');
    let listado: LicitacionListada[];
    try {
      listado = await this.mp.licitacionesDelDia(`${dia}${mes}${anio}`);
    } catch (error) {
      if (!(error instanceof MercadoPublicoError)) throw error;
      r.estado = 'cortada';
      resumen.avisos.push(`Historia: ${error.message}`);
      return false;
    }
    const filas = listado
      .filter((f) => f.CodigoExterno?.trim() && f.Nombre?.trim())
      .map((f) => ({
        codigo: f.CodigoExterno!.trim(),
        nombre: f.Nombre!.trim(),
      }));
    const conocidos = await this.repo.procesosConocidos(
      filas.map((f) => f.codigo),
    );
    const nuevas = filas.filter(
      (f) => !conocidos.has(f.codigo) && !deOtraRegion(f.codigo),
    );

    const candidatas: string[] = [];
    for (let i = 0; i < nuevas.length; i += NOMBRES_POR_TANDA) {
      const tanda = await this.lectura.candidatasPorNombre(
        nuevas.slice(i, i + NOMBRES_POR_TANDA),
        uso,
      );
      if (tanda === null) {
        r.estado = 'cortada';
        return false;
      }
      candidatas.push(...tanda);
    }

    let guardadas = 0;
    let lote: ProcesoMp[] = [];
    const vaciar = async () => {
      if (lote.length === 0) return;
      const aGuardar = lote;
      lote = [];
      await this.repo.guardarProcesos(aGuardar);
      guardadas += aGuardar.length;
      r.guardadas += aGuardar.length;
    };
    try {
      for (const codigo of candidatas) {
        if (sinTiempo()) {
          r.estado = 'cortada';
          return false;
        }
        try {
          const proceso = procesoDesdeLicitacion(
            await this.mp.detalleLicitacion(codigo),
          );
          if (proceso) lote.push(proceso);
        } catch (error) {
          if (!(error instanceof MercadoPublicoError)) throw error;
          if (error.sinCupo) {
            r.estado = 'cortada';
            resumen.avisos.push(`Historia: ${error.message}`);
            return false;
          }
        }
        if (lote.length >= 50) await vaciar();
      }
    } finally {
      await vaciar();
    }
    await this.repo.marcarDiaDeHistoria(fecha, {
      estado: 'hecha',
      listadas: filas.length,
      candidatas: candidatas.length,
      guardadas,
      error: null,
    });
    r.dias++;
    r.listadas += filas.length;
    r.candidatas += candidatas.length;
    return true;
  }
}
