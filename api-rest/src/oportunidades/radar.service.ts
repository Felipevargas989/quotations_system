import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { HistoriaService } from './historia/historia.service';
import {
  LECTURA_ACTUAL,
  LecturaDetenida,
  LecturaService,
  type Uso,
} from './lectura/lectura.service';
import { aplicarReglas } from './lectura/reglas';
import {
  cierreCambio,
  codigosDeRegiones,
  fechaChileAIso,
  procesoDesdeCompraAgil,
  procesoDesdeLicitacion,
  regionCalza,
} from './mercado-publico/mapeo';
import {
  MercadoPublicoClient,
  MercadoPublicoError,
} from './mercado-publico/mercado-publico.client';
import type {
  CompraAgilListada,
  LicitacionListada,
  ProcesoMp,
} from './mercado-publico/tipos';
import {
  type ConfigOportunidades,
  type EmpresaConModulo,
  OportunidadesRepository,
} from './oportunidades.repository';

// EL RADAR (doc 17 §5.1 y §5.2).
//
// La regla que vino del error del bot: "nuevo" es "no está en nuestra
// base", NUNCA "publicado hoy". Cada corrida pide la lista liviana de TODAS
// las licitaciones activas, la compara con la base y solo pide el detalle
// de lo que no tiene. Así lo que Mercado Público mostró tarde, o lo que se
// publicó un viernes en la noche, entra en la corrida siguiente.
//
// Las licitaciones se guardan de todo Chile (Felipe: "traer la mayor
// cantidad posible"); la IA solo lee las de las regiones que cada empresa
// configuró. Las compras ágiles se piden solo de esas regiones (su API
// tiene menos cupo).

/** De a uno: la API de Mercado Público rechaza las peticiones simultáneas
 *  con el mismo ticket (el bot de GitHub también pide de a uno). */
const DETALLES_EN_PARALELO = 1;
/** Una cuenta nueva de Anthropic tiene poco cupo por minuto. */
const LECTURAS_EN_PARALELO = 3;
/** Tope por corrida: la primera trae miles; las siguientes, decenas. */
const MAX_DETALLES_POR_CORRIDA = 6000;
const MAX_LECTURAS_POR_CORRIDA = 3000;
/** Tantos detalles fallidos seguidos = el servidor está caído: se corta. */
const FALLAS_SEGUIDAS_PARA_CORTAR = 10;
/** Tantas lecturas fallidas seguidas = algo anda mal con la IA (no con un
 *  proceso): se deja la lectura para la próxima corrida. */
const LECTURAS_FALLIDAS_PARA_CORTAR = 10;
const MINUTO = 60 * 1000;
const HORA = 60 * MINUTO;
/** Tiempo de cada corrida, contado desde que parte: detalles de
 *  licitaciones hasta los 45 minutos y lectura hasta los 150. Así una
 *  corrida nunca llega a las 3 horas en que la siguiente la da por muerta,
 *  y lo leído llega antes; lo que falta entra en la próxima. Las compras
 *  ágiles no tienen tope: entran de una con lo de la lista (decisión 20). */
const PRESUPUESTO_DETALLES_MS = 45 * MINUTO;
const PRESUPUESTO_CORRIDA_MS = 150 * MINUTO;
/** Las compras ágiles se guardan de a tantas. */
const COMPRAS_POR_LOTE = 100;
/** Cuánto hacia atrás se piden las compras ágiles publicadas (y todavía
 *  abiertas), en cada corrida. */
const VENTANA_COMPRAS_AGILES_MS = 10 * 24 * HORA;

const ESTADO_CERRADO = /cerrad|desiert|adjudicad|revocad|suspendid/i;

export type ResumenCorrida = {
  licitaciones: {
    estado: 'ok' | 'caida' | 'sin_ticket' | 'cortada';
    activas: number;
    nuevas: number;
    guardadas: number;
    sin_detalle: number;
    /** Nuevas que no alcanzaron a pedirse en esta corrida. */
    pendientes: number;
    cambios: number;
  };
  compras_agiles: {
    estado:
      | 'ok'
      | 'caida'
      | 'sin_cupo'
      | 'sin_regiones'
      | 'sin_ticket'
      | 'cortada';
    listadas: number;
    nuevas: number;
    guardadas: number;
    /** Nuevas que no alcanzaron a pedirse: entran en la próxima. */
    pendientes: number;
  };
  lectura: {
    estado: 'ok' | 'detenida' | 'sin_llave';
    empresas: number;
    leidas: number;
    /** De las leídas, las que se releyeron por reglas nuevas. */
    releidas: number;
    verdes: number;
    amarillas: number;
    rojas: number;
    sin_leer: number;
    tokens_entrada: number;
    tokens_salida: number;
  };
  adjudicaciones: {
    estado: 'ok' | 'sin_ticket' | 'cortada';
    revisadas: number;
    adjudicadas: number;
  };
  historia: {
    estado:
      | 'ok'
      | 'no_toca'
      | 'completa'
      | 'cortada'
      | 'detenida'
      /** Un día falló por algo que no es de Mercado Público ni de la IA:
       *  quedó marcado en error y la corrida sigue bien (18-10). */
      | 'falla'
      | 'sin_ticket'
      | 'sin_llave';
    dias: number;
    listadas: number;
    candidatas: number;
    guardadas: number;
  };
  avisos: string[];
  segundos?: number;
};

export const resumenVacio = (): ResumenCorrida => ({
  licitaciones: {
    estado: 'ok',
    activas: 0,
    nuevas: 0,
    guardadas: 0,
    sin_detalle: 0,
    pendientes: 0,
    cambios: 0,
  },
  compras_agiles: {
    estado: 'ok',
    listadas: 0,
    nuevas: 0,
    guardadas: 0,
    pendientes: 0,
  },
  lectura: {
    estado: 'ok',
    empresas: 0,
    leidas: 0,
    releidas: 0,
    verdes: 0,
    amarillas: 0,
    rojas: 0,
    sin_leer: 0,
    tokens_entrada: 0,
    tokens_salida: 0,
  },
  adjudicaciones: { estado: 'ok', revisadas: 0, adjudicadas: 0 },
  historia: {
    estado: 'ok',
    dias: 0,
    listadas: 0,
    candidatas: 0,
    guardadas: 0,
  },
  avisos: [],
});

/** Las licitaciones de la lista, de la que cierra antes a la que cierra
 *  después; sin cierre informado, al final. */
const ordenarPorCierre = (filas: LicitacionListada[]): LicitacionListada[] =>
  filas
    .map((fila) => {
      const iso = fechaChileAIso(fila.FechaCierre);
      const t = iso ? new Date(iso).getTime() : NaN;
      return { fila, t: Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t };
    })
    .sort((a, b) => a.t - b.t)
    .map((x) => x.fila);

/** El cierre como número, para ordenar: sin cierre informado, al final. */
const cierreParaOrdenar = (p: { fecha_cierre: string | null }): number => {
  const t = p.fecha_cierre ? new Date(p.fecha_cierre).getTime() : NaN;
  return Number.isNaN(t) ? Number.MAX_SAFE_INTEGER : t;
};

/** Corre `fn` sobre `items`, `n` a la vez. Si una llamada lanza, deja de
 *  repartir trabajo y relanza ese error al final. */
export async function enParalelo<T>(
  items: T[],
  n: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let siguiente = 0;
  let falla: { error: unknown } | null = null;
  const trabajador = async () => {
    while (!falla && siguiente < items.length) {
      const item = items[siguiente++];
      try {
        await fn(item);
      } catch (error) {
        falla = { error };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, () => trabajador()),
  );
  if (falla) throw (falla as { error: unknown }).error;
}

@Injectable()
export class RadarService {
  constructor(
    private readonly mp: MercadoPublicoClient,
    private readonly repo: OportunidadesRepository,
    private readonly lectura: LecturaService,
    private readonly historia: HistoriaService,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(RadarService.name);
  }

  /** Toma el candado y deja la corrida andando en segundo plano (para el
   *  botón: la primera corrida puede tardar una hora). null = ya había
   *  una en marcha. */
  async iniciar(origen: 'manual' | 'arranque'): Promise<number | null> {
    const id = await this.repo.tomarCorrida(origen);
    if (id === null) return null;
    void this.ejecutar(id, origen);
    return id;
  }

  /** Al encender: suelta el candado de una corrida que murió con el
   *  proceso anterior. Nunca lanza. */
  async limpiarAlEncender(encendido: string): Promise<void> {
    try {
      const n = await this.repo.abandonarCorridasDeAntes(encendido);
      if (n > 0) {
        this.logger.warn(
          `radar: ${n} corrida(s) quedaron a medias con el reinicio; marcadas abandonadas`,
        );
      }
    } catch (error) {
      this.logger.error(
        `radar: no pude revisar las corridas a medias: ${mensajeDe(error)}`,
      );
    }
  }

  /** Corre completo y espera (el reloj). null = ya había una en marcha. */
  async correr(origen: 'reloj'): Promise<ResumenCorrida | null> {
    const id = await this.repo.tomarCorrida(origen);
    if (id === null) {
      this.logger.info('radar: ya hay una corrida en marcha; esta no parte');
      return null;
    }
    return this.ejecutar(id, origen);
  }

  /** Nunca lanza: todo error queda en la bitácora de la corrida. */
  private async ejecutar(
    id: number,
    origen: 'reloj' | 'manual' | 'arranque',
  ): Promise<ResumenCorrida> {
    const resumen = resumenVacio();
    const inicio = Date.now();
    try {
      const empresas = await this.repo.empresasConModulo();
      const configs = new Map<number, ConfigOportunidades>();
      for (const empresa of empresas) {
        const config = await this.repo.configDe(empresa.id);
        if (config) configs.set(empresa.id, config);
      }
      const regiones = [
        ...new Set([...configs.values()].flatMap((c) => c.regiones ?? [])),
      ];

      // Primero las compras ágiles (entran todas de una con lo de la lista y
      // cierran en días: se leen al tiro, decisión 20), después las
      // licitaciones, y se lee otra vez.
      const intentadas = new Set<string>();
      await this.comprasAgiles(resumen, regiones);
      await this.leer(resumen, empresas, configs, inicio, intentadas);
      await this.licitaciones(resumen, inicio);
      await this.historia.revisarAdjudicaciones(resumen, regiones, inicio);
      await this.leer(resumen, empresas, configs, inicio, intentadas);
      await this.historia.cargarHistoria(resumen, inicio, origen);

      resumen.segundos = Math.round((Date.now() - inicio) / 1000);
      await this.repo.terminarCorrida(id, 'ok', resumen);
      this.logger.info(
        `radar ${id} listo en ${resumen.segundos} s: ${resumen.licitaciones.guardadas} licitaciones y ${resumen.compras_agiles.guardadas} compras ágiles nuevas, ${resumen.licitaciones.cambios} cambios, ${resumen.lectura.leidas} leídas (${resumen.lectura.verdes} verdes, ${resumen.lectura.amarillas} amarillas, ${resumen.lectura.releidas} releídas)`,
      );
    } catch (error) {
      resumen.segundos = Math.round((Date.now() - inicio) / 1000);
      this.logger.error(`radar ${id} falló: ${mensajeDe(error)}`);
      try {
        await this.repo.terminarCorrida(id, 'error', resumen, mensajeDe(error));
      } catch (e) {
        this.logger.error(
          `radar ${id}: tampoco pude anotar la falla: ${mensajeDe(e)}`,
        );
      }
    }
    return resumen;
  }

  // ------------------------------------------------------------
  // Licitaciones: todo Chile, solo lo que no está en la base
  // ------------------------------------------------------------
  private async licitaciones(
    resumen: ResumenCorrida,
    inicio: number,
  ): Promise<void> {
    const r = resumen.licitaciones;
    if (!this.mp.configurado) {
      r.estado = 'sin_ticket';
      resumen.avisos.push('Falta MP_TICKET: no se revisaron las licitaciones.');
      return;
    }

    let listado: LicitacionListada[];
    try {
      listado = await this.mp.licitacionesActivas();
    } catch (error) {
      if (error instanceof MercadoPublicoError) {
        r.estado = 'caida';
        resumen.avisos.push(error.message);
        return;
      }
      throw error;
    }

    const filas = listado.filter((f) => f.CodigoExterno?.trim());
    r.activas = filas.length;
    const conocidos = await this.repo.procesosConocidos(
      filas.map((f) => f.CodigoExterno!.trim()),
    );

    // Lo que ya teníamos: ¿movieron el cierre?, ¿se reabrió?
    const cambios: Array<{
      codigo: string;
      tipo: string;
      antes: unknown;
      despues: unknown;
    }> = [];
    for (const fila of filas) {
      const codigo = fila.CodigoExterno!.trim();
      const guardado = conocidos.get(codigo);
      if (!guardado) continue;
      const cierre = fechaChileAIso(fila.FechaCierre);
      const reabierta = Boolean(
        guardado.estado && ESTADO_CERRADO.test(guardado.estado),
      );
      const cierreMovido =
        cierre !== null && cierreCambio(guardado.fecha_cierre, cierre);
      if (!reabierta && !cierreMovido) continue;

      await this.repo.actualizarCierre(
        codigo,
        cierre ?? guardado.fecha_cierre,
        reabierta ? 'Publicada' : null,
      );
      if (cierreMovido) {
        cambios.push({
          codigo,
          tipo: 'fecha_cierre',
          antes: { fecha_cierre: guardado.fecha_cierre },
          despues: { fecha_cierre: cierre },
        });
      }
      if (reabierta) {
        cambios.push({
          codigo,
          tipo: 'reapertura',
          antes: { estado: guardado.estado },
          despues: { estado: 'Publicada' },
        });
      }
    }
    if (cambios.length > 0) await this.repo.registrarCambios(cambios);
    r.cambios = cambios.length;

    // Lo nuevo: se pide el detalle (ahí viene la región) y se guarda. Lo
    // que cierra antes, primero: si la corrida se corta, lo urgente ya está.
    const nuevas = ordenarPorCierre(
      filas.filter((f) => !conocidos.has(f.CodigoExterno!.trim())),
    );
    r.nuevas = nuevas.length;
    this.logger.info(
      `radar: ${r.activas} licitaciones activas, ${r.cambios} con cambios, ${r.nuevas} nuevas`,
    );
    let pendientes: ProcesoMp[] = [];
    const vaciar = async () => {
      if (pendientes.length === 0) return;
      const lote = pendientes;
      pendientes = [];
      await this.repo.guardarProcesos(lote);
      r.guardadas += lote.length;
    };

    let fallasSeguidas = 0;
    let intentadas = 0;
    let sinTiempo = false;
    try {
      await enParalelo(
        nuevas.slice(0, MAX_DETALLES_POR_CORRIDA),
        DETALLES_EN_PARALELO,
        async (fila: LicitacionListada) => {
          if (sinTiempo || Date.now() - inicio > PRESUPUESTO_DETALLES_MS) {
            sinTiempo = true;
            return;
          }
          intentadas++;
          const codigo = fila.CodigoExterno!.trim();
          let detalle;
          try {
            detalle = await this.mp.detalleLicitacion(codigo);
            fallasSeguidas = 0;
          } catch (error) {
            if (!(error instanceof MercadoPublicoError)) throw error;
            if (error.sinCupo) throw error;
            r.sin_detalle++;
            if (r.sin_detalle <= 3) this.logger.warn(`radar: ${error.message}`);
            if (++fallasSeguidas >= FALLAS_SEGUIDAS_PARA_CORTAR) throw error;
            return;
          }
          const proceso = procesoDesdeLicitacion(detalle);
          if (!proceso) {
            r.sin_detalle++;
            if (r.sin_detalle <= 3) {
              this.logger.warn(
                `radar: licitación ${codigo}: Mercado Público no trajo el detalle`,
              );
            }
            return;
          }
          pendientes.push(proceso);
          if (pendientes.length >= 100) await vaciar();
        },
      );
    } catch (error) {
      if (!(error instanceof MercadoPublicoError)) throw error;
      r.estado = 'cortada';
      this.logger.warn(`radar: licitaciones cortadas: ${error.message}`);
      resumen.avisos.push(
        `Licitaciones cortadas a la mitad (${error.message}); lo que falta entra en la próxima corrida.`,
      );
    } finally {
      await vaciar();
      r.pendientes = nuevas.length - intentadas;
    }
    if (sinTiempo) {
      r.estado = 'cortada';
      resumen.avisos.push(
        `Se acabó el tiempo de esta corrida para pedir detalles: quedan ${r.pendientes} licitaciones nuevas para la próxima.`,
      );
    }
  }

  // ------------------------------------------------------------
  // Compras ágiles: solo las regiones configuradas, todas de una
  // ------------------------------------------------------------
  // Decisión 20 (Felipe, 17-10: "¿las compras ágiles están funcionando? no
  // veo ninguna"). Pedir el detalle de cada una tardaba unos 20 segundos:
  // en la pasada de las 18:00 entraron 54 de 750, y cierran en días. Ahora
  // entran todas con lo que trae la lista (nombre, comprador, monto,
  // región y cierre), primero las que cierran antes, y la IA las lee al
  // tiro, como hacía el bot. La descripción y los productos se piden
  // cuando alguien abre una (OportunidadesService.ficha).
  private async comprasAgiles(
    resumen: ResumenCorrida,
    regiones: string[],
  ): Promise<void> {
    const r = resumen.compras_agiles;
    if (!this.mp.configurado) {
      r.estado = 'sin_ticket';
      return;
    }
    const codigos = codigosDeRegiones(regiones);
    if (codigos.length === 0) {
      r.estado = 'sin_regiones';
      return;
    }

    // SIEMPRE los últimos 10 días (las compras ágiles cierran en días), no
    // "desde la última corrida buena": el 17-10 la pasada de las 18:00 vio
    // 750 y guardó 54 (todavía pedía el detalle de a una) y aun así quedó
    // "ok", así que la siguiente habría pedido solo desde el 15-10 y lo
    // publicado antes, todavía abierto, no se habría vuelto a pedir nunca
    // (Felipe, 18-10: "¿cómo sé que está trayendo todas?"). Pedir 10 días
    // cuesta unas páginas más de la lista y se arregla solo si una corrida
    // se corta: lo que ya está en la base no se vuelve a guardar.
    const desde = new Date(Date.now() - VENTANA_COMPRAS_AGILES_MS)
      .toISOString()
      .replace(/\.\d{3}Z$/, 'Z');

    let items: CompraAgilListada[];
    try {
      items = await this.mp.comprasAgiles(desde, codigos);
    } catch (error) {
      if (error instanceof MercadoPublicoError) {
        r.estado = error.sinCupo ? 'sin_cupo' : 'caida';
        resumen.avisos.push(error.message);
        return;
      }
      throw error;
    }

    const filas = items.filter((i) => i.codigo?.trim());
    r.listadas = filas.length;
    const conocidos = await this.repo.procesosConocidos(
      filas.map((i) => i.codigo!.trim()),
    );
    const nuevas = filas.filter((i) => !conocidos.has(i.codigo!.trim()));
    r.nuevas = nuevas.length;
    this.logger.info(
      `radar: ${r.listadas} compras ágiles en la lista, ${r.nuevas} nuevas`,
    );

    // Con lo de la lista, sin pedir el detalle; de a lote, primero las que
    // cierran antes.
    const procesos = nuevas
      .map((item) => procesoDesdeCompraAgil(item, null))
      .filter((p): p is ProcesoMp => p !== null)
      .sort((a, b) => cierreParaOrdenar(a) - cierreParaOrdenar(b));
    for (let i = 0; i < procesos.length; i += COMPRAS_POR_LOTE) {
      const lote = procesos.slice(i, i + COMPRAS_POR_LOTE);
      await this.repo.guardarProcesos(lote);
      r.guardadas += lote.length;
    }
    r.pendientes = 0;
  }

  // ------------------------------------------------------------
  // La lectura con IA, por empresa
  // ------------------------------------------------------------
  /** `intentadas` (empresa:código) evita releer o reintentar en la misma
   *  corrida lo que ya se intentó en la primera pasada. */
  private async leer(
    resumen: ResumenCorrida,
    empresas: EmpresaConModulo[],
    configs: Map<number, ConfigOportunidades>,
    inicio: number,
    intentadas: Set<string>,
  ): Promise<void> {
    const r = resumen.lectura;
    // Si la primera pasada se detuvo o no hay llave, la segunda no insiste.
    if (r.estado !== 'ok') return;
    if (!this.lectura.configurado) {
      r.estado = 'sin_llave';
      resumen.avisos.push(
        'Falta ANTHROPIC_API_KEY: los procesos quedaron guardados sin leer.',
      );
      return;
    }

    const uso: Uso = { entrada: 0, salida: 0 };
    let restantes = MAX_LECTURAS_POR_CORRIDA - r.leidas;
    let fallidasSeguidas = 0;
    let empresasLeidas = 0;
    // Lo que queda sin leer lo dice la última pasada.
    r.sin_leer = 0;
    try {
      const abiertos = await this.repo.procesosAbiertos();
      for (const empresa of empresas) {
        const config = configs.get(empresa.id);
        if (!config || (config.regiones ?? []).length === 0) continue;
        empresasLeidas++;

        const catalogo = await this.repo.catalogoResumido(empresa.id);
        const perfil = {
          nombre: empresa.name,
          perfil: config.perfil,
          ...catalogo,
        };
        // Lo nuevo y lo leído con reglas viejas que nadie ha tocado
        // (decisión 19).
        const { hechas, releer } = await this.repo.lecturasDe(
          empresa.id,
          LECTURA_ACTUAL,
        );
        // Lo que cierra antes se lee primero: si la corrida se corta, lo
        // urgente ya quedó leído.
        const pendientes = abiertos
          .filter(
            (p) =>
              !hechas.has(p.codigo) && regionCalza(p.region, config.regiones),
          )
          .sort((a, b) => cierreParaOrdenar(a) - cierreParaOrdenar(b));
        const yaIntentadas = pendientes.filter((p) =>
          intentadas.has(`${empresa.id}:${p.codigo}`),
        ).length;
        r.sin_leer += yaIntentadas;
        const nuevas = pendientes.filter(
          (p) => !intentadas.has(`${empresa.id}:${p.codigo}`),
        );
        const tanda = nuevas.slice(0, Math.max(restantes, 0));
        r.sin_leer += nuevas.length - tanda.length;
        restantes -= tanda.length;

        await enParalelo(tanda, LECTURAS_EN_PARALELO, async (proceso) => {
          if (Date.now() - inicio > PRESUPUESTO_CORRIDA_MS) {
            throw new LecturaDetenida(
              'Se acabó el tiempo de esta corrida: lo que falta se lee en la próxima.',
            );
          }
          intentadas.add(`${empresa.id}:${proceso.codigo}`);
          const lectura = await this.lectura.leer(proceso, perfil, uso);
          if (!lectura) {
            r.sin_leer++;
            if (++fallidasSeguidas >= LECTURAS_FALLIDAS_PARA_CORTAR) {
              throw new LecturaDetenida(
                `${LECTURAS_FALLIDAS_PARA_CORTAR} lecturas seguidas fallaron; la lectura sigue en la próxima corrida`,
              );
            }
            return;
          }
          fallidasSeguidas = 0;
          const final = aplicarReglas(lectura, proceso, {
            comunasCercanas: config.comunas_cercanas ?? [],
            umbralAltoValor: empresa.high_value_threshold,
          });
          const relectura = releer.has(proceso.codigo);
          await this.repo.guardarLectura(
            empresa.id,
            proceso.codigo,
            final,
            LECTURA_ACTUAL,
            relectura,
          );
          r.leidas++;
          if (relectura) r.releidas++;
          if (final.semaforo === 'verde') r.verdes++;
          else if (final.semaforo === 'amarillo') r.amarillas++;
          else r.rojas++;
        });
      }
    } catch (error) {
      if (!(error instanceof LecturaDetenida)) throw error;
      r.estado = 'detenida';
      resumen.avisos.push(error.message);
    } finally {
      r.empresas = Math.max(r.empresas, empresasLeidas);
      r.tokens_entrada += uso.entrada;
      r.tokens_salida += uso.salida;
    }
  }
}
