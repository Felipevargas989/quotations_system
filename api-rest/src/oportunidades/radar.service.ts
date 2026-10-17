import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import {
  LecturaDetenida,
  LecturaService,
  MODELO_LECTURA,
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
  CompraAgilDetalle,
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
/** Tiempo de cada corrida: pedir detalles hasta los 80 minutos y leer hasta
 *  los 150. Así una corrida nunca llega a las 3 horas en que la siguiente
 *  la da por muerta; lo que falta entra en la próxima. */
const PRESUPUESTO_DETALLES_MS = 80 * MINUTO;
const PRESUPUESTO_COMPRAS_MS = 100 * MINUTO;
const PRESUPUESTO_CORRIDA_MS = 150 * MINUTO;

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
    verdes: number;
    amarillas: number;
    rojas: number;
    sin_leer: number;
    tokens_entrada: number;
    tokens_salida: number;
  };
  avisos: string[];
  segundos?: number;
};

const resumenVacio = (): ResumenCorrida => ({
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
    verdes: 0,
    amarillas: 0,
    rojas: 0,
    sin_leer: 0,
    tokens_entrada: 0,
    tokens_salida: 0,
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
    void this.ejecutar(id);
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
    return this.ejecutar(id);
  }

  /** Nunca lanza: todo error queda en la bitácora de la corrida. */
  private async ejecutar(id: number): Promise<ResumenCorrida> {
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

      await this.licitaciones(resumen, inicio);
      await this.comprasAgiles(resumen, regiones, inicio);
      await this.leer(resumen, empresas, configs, inicio);

      resumen.segundos = Math.round((Date.now() - inicio) / 1000);
      await this.repo.terminarCorrida(id, 'ok', resumen);
      this.logger.info(
        `radar ${id} listo en ${resumen.segundos} s: ${resumen.licitaciones.guardadas} licitaciones y ${resumen.compras_agiles.guardadas} compras ágiles nuevas, ${resumen.licitaciones.cambios} cambios, ${resumen.lectura.leidas} leídas (${resumen.lectura.verdes} verdes, ${resumen.lectura.amarillas} amarillas)`,
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
  // Compras ágiles: solo las regiones configuradas
  // ------------------------------------------------------------
  private async comprasAgiles(
    resumen: ResumenCorrida,
    regiones: string[],
    inicio: number,
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

    // Desde la última corrida buena, con 48 horas de margen; nunca más de
    // 10 días atrás (las compras ágiles cierran en días).
    const ultima = await this.repo.ultimaCorridaOk();
    const base = ultima
      ? new Date(ultima).getTime()
      : Date.now() - 7 * 24 * HORA;
    const desde = new Date(Math.max(base - 48 * HORA, Date.now() - 240 * HORA))
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

    // Se guardan de a 50: si el motor se reinicia a la mitad, lo ya pedido
    // no se pierde.
    let porGuardar: ProcesoMp[] = [];
    const vaciar = async () => {
      if (porGuardar.length === 0) return;
      const lote = porGuardar;
      porGuardar = [];
      await this.repo.guardarProcesos(lote);
      r.guardadas += lote.length;
    };
    let sinCupo = false;
    let sinTiempo = false;
    let intentadas = 0;
    try {
      await enParalelo(
        nuevas,
        DETALLES_EN_PARALELO,
        async (item: CompraAgilListada) => {
          if (sinTiempo || Date.now() - inicio > PRESUPUESTO_COMPRAS_MS) {
            sinTiempo = true;
            return;
          }
          intentadas++;
          let detalle: CompraAgilDetalle | null = null;
          if (!sinCupo) {
            try {
              detalle = await this.mp.detalleCompraAgil(item.codigo!.trim());
            } catch (error) {
              if (!(error instanceof MercadoPublicoError)) throw error;
              if (error.sinCupo) sinCupo = true;
            }
          }
          // Sin detalle igual se guarda: nombre, comprador y monto vienen en
          // la lista, y la próxima vez no se vuelve a pedir.
          const proceso = procesoDesdeCompraAgil(item, detalle);
          if (proceso) porGuardar.push(proceso);
          if (porGuardar.length >= 50) await vaciar();
        },
      );
    } finally {
      await vaciar();
      r.pendientes = nuevas.length - intentadas;
    }
    if (sinCupo) {
      r.estado = 'sin_cupo';
      resumen.avisos.push(
        'Compra Ágil sin cupo para detalles: algunas quedaron solo con lo de la lista.',
      );
    }
    if (sinTiempo) {
      r.estado = 'cortada';
      resumen.avisos.push(
        `Se acabó el tiempo de esta corrida para las compras ágiles: quedan ${r.pendientes} para la próxima.`,
      );
    }
  }

  // ------------------------------------------------------------
  // La lectura con IA, por empresa
  // ------------------------------------------------------------
  private async leer(
    resumen: ResumenCorrida,
    empresas: EmpresaConModulo[],
    configs: Map<number, ConfigOportunidades>,
    inicio: number,
  ): Promise<void> {
    const r = resumen.lectura;
    if (!this.lectura.configurado) {
      r.estado = 'sin_llave';
      resumen.avisos.push(
        'Falta ANTHROPIC_API_KEY: los procesos quedaron guardados sin leer.',
      );
      return;
    }

    const uso: Uso = { entrada: 0, salida: 0 };
    let restantes = MAX_LECTURAS_POR_CORRIDA;
    let fallidasSeguidas = 0;
    try {
      const abiertos = await this.repo.procesosAbiertos();
      for (const empresa of empresas) {
        const config = configs.get(empresa.id);
        if (!config || (config.regiones ?? []).length === 0) continue;
        r.empresas++;

        const catalogo = await this.repo.catalogoResumido(empresa.id);
        const perfil = {
          nombre: empresa.name,
          perfil: config.perfil,
          ...catalogo,
        };
        const leidos = await this.repo.codigosLeidos(empresa.id);
        // Lo que cierra antes se lee primero: si la corrida se corta, lo
        // urgente ya quedó leído.
        const pendientes = abiertos
          .filter(
            (p) =>
              !leidos.has(p.codigo) && regionCalza(p.region, config.regiones),
          )
          .sort((a, b) => cierreParaOrdenar(a) - cierreParaOrdenar(b));
        const tanda = pendientes.slice(0, Math.max(restantes, 0));
        r.sin_leer += pendientes.length - tanda.length;
        restantes -= tanda.length;

        await enParalelo(tanda, LECTURAS_EN_PARALELO, async (proceso) => {
          if (Date.now() - inicio > PRESUPUESTO_CORRIDA_MS) {
            throw new LecturaDetenida(
              'Se acabó el tiempo de esta corrida: lo que falta se lee en la próxima.',
            );
          }
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
          await this.repo.guardarLectura(
            empresa.id,
            proceso.codigo,
            final,
            MODELO_LECTURA,
          );
          r.leidas++;
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
      r.tokens_entrada = uso.entrada;
      r.tokens_salida = uso.salida;
    }
  }
}
