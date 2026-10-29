import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { createWriteStream } from 'node:fs';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { comprasAgilesDelMes } from './compras-agiles-del-mes';
import { type FilaDelCsv, registrosDelCsv } from './csv';
import {
  diaUnoDe,
  type Fuente,
  FUENTES,
  type Mes,
  MESES_DE_HISTORIA,
  mesesHaciaAtras,
  urlDelArchivo,
} from './datos-abiertos';
import {
  type CargaDelMercado,
  DatosAbiertosRepository,
} from './datos-abiertos.repository';
import { licitacionesDelMes } from './licitaciones-del-mes';
import { ordenesDeCompraDelMes } from './ordenes-de-compra-del-mes';
import { entradasDelZip, leerEntrada } from './zip';

// EL CARGADOR DEL MERCADO (decisión 101 del doc 17). Mes a mes, del más
// nuevo al más viejo: baja el archivo de ChileCompra a una carpeta temporal,
// lo resume y lo guarda; después borra el archivo. Un mes ya cargado se
// salta mientras su archivo no cambie (la fecha que da ChileCompra): las
// licitaciones del mes en curso cambian todos los días y se recargan cada
// noche. Un mes que falla queda en «error» y se reintenta la noche
// siguiente. Una sola carga a la vez.
// Las órdenes de compra (decisión 108) son distintas: ChileCompra rehace a
// diario los archivos de los últimos 15 meses, 1,4 GB. Felipe: "yo traeria
// las del día no más". Cada noche se lee el mes en curso y el anterior; un
// mes más viejo ya cargado se repasa una vez al mes, para sumar lo anulado.

export type CabeceraDelArchivo = {
  existe: boolean;
  modificado: string | null;
  bytes: number | null;
};

/** Cómo se llega a ChileCompra (las pruebas la cambian). */
export type RedDeChileCompra = {
  cabecera(url: string): Promise<CabeceraDelArchivo>;
  bajar(url: string, ruta: string): Promise<void>;
};

export type ResumenDeLaCarga = {
  cargadas: number;
  sinCambios: number;
  sinPublicar: number;
  errores: number;
  pendientes: number;
};

const SEGUNDO = 1000;
const DIA = 24 * 60 * 60 * SEGUNDO;

/** Cada cuánto se repasa una orden de compra de un mes viejo. */
export const REPASO_DE_ORDENES_MS = 30 * DIA;

/** Cuántos meses atrás de hoy está ese mes (0 = el mes en curso), en hora
 *  de Chile. */
export const mesesAtras = (mes: Mes, hoy: Date): number => {
  const [actual] = mesesHaciaAtras(hoy, 1);
  return actual.anio * 12 + actual.mes - (mes.anio * 12 + mes.mes);
};

/** Un mes viejo de órdenes de compra, cargado hace menos de un mes: no se
 *  vuelve a leer aunque ChileCompra haya rehecho su archivo. */
export const ordenesAlDia = (
  mes: Mes,
  registrada: CargaDelMercado | undefined,
  ahora: Date,
): boolean =>
  registrada?.estado === 'lista' &&
  mesesAtras(mes, ahora) >= 2 &&
  !!registrada.terminada_en &&
  ahora.getTime() - Date.parse(registrada.terminada_en) < REPASO_DE_ORDENES_MS;

export const redDeChileCompra: RedDeChileCompra = {
  async cabecera(url) {
    const r = await fetch(url, {
      method: 'HEAD',
      signal: AbortSignal.timeout(30 * SEGUNDO),
    });
    if (r.status === 404)
      return { existe: false, modificado: null, bytes: null };
    if (!r.ok)
      throw new Error(`ChileCompra respondió ${r.status} al mirar el archivo`);
    const largo = Number(r.headers.get('content-length'));
    return {
      existe: true,
      modificado: r.headers.get('last-modified'),
      bytes: Number.isFinite(largo) ? largo : null,
    };
  },
  async bajar(url, ruta) {
    const r = await fetch(url, {
      signal: AbortSignal.timeout(20 * 60 * SEGUNDO),
    });
    if (!r.ok || !r.body) {
      throw new Error(`ChileCompra respondió ${r.status} al bajar el archivo`);
    }
    await pipeline(
      Readable.fromWeb(r.body as WebReadableStream<Uint8Array>),
      createWriteStream(ruta),
    );
  },
};

/** Las filas de todos los CSV del ZIP, en orden; se puede leer varias
 *  veces (las compras ágiles se leen dos). */
export async function lectorDelZip(
  ruta: string,
): Promise<() => AsyncIterable<FilaDelCsv>> {
  const entradas = (await entradasDelZip(ruta))
    .filter((e) => /\.csv$/i.test(e.nombre))
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
  if (entradas.length === 0) throw new Error('el archivo no trae ningún CSV');
  return async function* () {
    for (const entrada of entradas) {
      yield* registrosDelCsv(await leerEntrada(ruta, entrada));
    }
  };
}

@Injectable()
export class DatosAbiertosService {
  red: RedDeChileCompra = redDeChileCompra;
  private corriendo = false;

  constructor(
    private readonly repo: DatosAbiertosRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(DatosAbiertosService.name);
  }

  get enMarcha(): boolean {
    return this.corriendo;
  }

  /** Arranca una carga por detrás. false = ya hay una en marcha. */
  iniciar(opciones: {
    hasta: number;
    meses?: number;
    fuentes?: readonly Fuente[];
    origen: string;
  }): boolean {
    if (this.corriendo) return false;
    void this.cargar(opciones).catch((error) =>
      this.logger.error(
        `datos abiertos: la carga se cayó: ${mensajeDe(error)}`,
      ),
    );
    return true;
  }

  /** Carga lo que falte o haya cambiado, hasta la hora tope. null = ya había
   *  una carga en marcha. */
  async cargar(opciones: {
    hasta: number;
    meses?: number;
    fuentes?: readonly Fuente[];
    origen: string;
  }): Promise<ResumenDeLaCarga | null> {
    if (this.corriendo) return null;
    this.corriendo = true;
    const resumen: ResumenDeLaCarga = {
      cargadas: 0,
      sinCambios: 0,
      sinPublicar: 0,
      errores: 0,
      pendientes: 0,
    };
    try {
      const registradas = new Map(
        (await this.repo.cargas()).map((c) => [`${c.fuente}:${c.mes}`, c]),
      );
      const meses = mesesHaciaAtras(
        new Date(),
        opciones.meses ?? MESES_DE_HISTORIA,
      );
      const fuentes = opciones.fuentes?.length ? opciones.fuentes : FUENTES;
      for (const mes of meses) {
        for (const fuente of fuentes) {
          if (Date.now() > opciones.hasta) {
            resumen.pendientes++;
            continue;
          }
          await this.unMes(
            fuente,
            mes,
            registradas.get(`${fuente}:${diaUnoDe(mes)}`),
            resumen,
          );
        }
      }
      this.logger.info(
        `datos abiertos (${opciones.origen}): ${resumen.cargadas} meses cargados, ${resumen.sinCambios} sin cambios, ${resumen.sinPublicar} sin publicar, ${resumen.errores} con error, ${resumen.pendientes} para la próxima`,
      );
      return resumen;
    } finally {
      this.corriendo = false;
    }
  }

  private async unMes(
    fuente: Fuente,
    mes: Mes,
    registrada: CargaDelMercado | undefined,
    resumen: ResumenDeLaCarga,
  ): Promise<void> {
    const url = urlDelArchivo(fuente, mes);
    const dia = diaUnoDe(mes);
    let cabecera: CabeceraDelArchivo;
    try {
      cabecera = await this.red.cabecera(url);
    } catch (error) {
      resumen.errores++;
      this.logger.warn(`datos abiertos: ${fuente} ${dia}: ${mensajeDe(error)}`);
      return;
    }
    if (!cabecera.existe) {
      resumen.sinPublicar++;
      return;
    }
    if (
      (registrada?.estado === 'lista' &&
        registrada.archivo_modificado === cabecera.modificado) ||
      (fuente === 'ordenes_de_compra' &&
        ordenesAlDia(mes, registrada, new Date()))
    ) {
      resumen.sinCambios++;
      return;
    }
    const carpeta = await mkdtemp(join(tmpdir(), 'chilecompra-'));
    try {
      await this.repo.marcarCarga(fuente, dia, {
        estado: 'cargando',
        empezo_en: new Date().toISOString(),
        error: null,
      });
      const ruta = join(carpeta, 'mes.zip');
      await this.red.bajar(url, ruta);
      const leer = await lectorDelZip(ruta);
      let filas: number;
      let procesos: number;
      if (fuente === 'licitaciones') {
        const del = await licitacionesDelMes(leer(), dia);
        await this.repo.guardarLicitaciones(del);
        filas = del.filas;
        procesos = del.licitaciones.length;
      } else if (fuente === 'ordenes_de_compra') {
        const del = await ordenesDeCompraDelMes(leer(), dia);
        await this.repo.guardarOrdenesDeCompra(dia, del);
        filas = del.filas;
        procesos = del.ordenes.length;
      } else {
        const del = await comprasAgilesDelMes(leer, dia);
        await this.repo.guardarComprasAgiles(dia, del);
        filas = del.filas;
        procesos = del.todas;
      }
      await this.repo.marcarCarga(fuente, dia, {
        estado: 'lista',
        archivo_modificado: cabecera.modificado,
        bytes: cabecera.bytes,
        filas,
        procesos,
        error: null,
        terminada_en: new Date().toISOString(),
      });
      resumen.cargadas++;
      this.logger.info(
        `datos abiertos: ${fuente} ${dia}: ${procesos} procesos de ${filas} filas`,
      );
    } catch (error) {
      resumen.errores++;
      this.logger.warn(
        `datos abiertos: ${fuente} ${dia} falló: ${mensajeDe(error)}`,
      );
      await this.repo
        .marcarCarga(fuente, dia, {
          estado: 'error',
          error: mensajeDe(error).slice(0, 500),
          terminada_en: new Date().toISOString(),
        })
        .catch(() => undefined);
    } finally {
      await rm(carpeta, { recursive: true, force: true });
    }
  }
}
