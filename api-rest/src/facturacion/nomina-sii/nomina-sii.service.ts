import { ConflictException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { createWriteStream, existsSync } from 'node:fs';
import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import {
  entradasDelZip,
  leerEntrada,
} from '../../oportunidades/datos-abiertos/zip';
import { LARGO_MAXIMO } from '../datos-del-receptor';
import {
  ARCHIVOS_DE_LA_NOMINA,
  COLUMNAS_DE_ACTIVIDADES,
  COLUMNAS_DE_DOMICILIOS,
  GruposEnOrden,
  TAMANO_DEL_TRAMO,
  TRAMOS,
  URL_DE_LA_NOMINA,
  actividadDe,
  columnasDe,
  contribuyenteDe,
  cortar,
  filaDe,
  lineasDelFlujo,
  porRut,
  rutDe,
  tramoDe,
  type ContribuyenteDelSii,
} from './nomina-sii';
import { NominaSiiRepository } from './nomina-sii.repository';

/** Cómo se bajan los archivos (en las pruebas, de mentira). */
export interface RedDelSii {
  bajar(url: string, ruta: string): Promise<void>;
}

const MINUTO = 60_000;

export const redDelSii: RedDelSii = {
  async bajar(url, ruta) {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'Eventia (facturacion)' },
      signal: AbortSignal.timeout(20 * MINUTO),
    });
    if (!r.ok || !r.body)
      throw new Error(`el SII respondió ${r.status} al bajar la nómina`);
    await pipeline(
      Readable.fromWeb(r.body as WebReadableStream<Uint8Array>),
      createWriteStream(ruta),
    );
  },
};

/** Las empresas que se guardan de una vez. */
const TANDA = 1000;
/** Cada cuántas empresas se anota el avance. */
const AVISO = 50_000;
/** Menos que esto es una nómina rota: no se borra lo que había. */
const MINIMO_DE_EMPRESAS = 100_000;
/** Una carga que lleva más que esto «cargando» se dio por caída. */
const CARGA_CAIDA_MS = 3 * 60 * MINUTO;
/** Cuántas líneas de nombres se juntan en memoria antes de escribirlas. */
const NOMBRES_EN_MEMORIA = 50_000;

/**
 * «CARGAR LA NÓMINA DEL SII» (doc 19 §9.27; Felipe, 07-11: *"¿cómo lo
 * podemos hacer para que al momento de facturar, el sistema cargue todo solo
 * con el RUT?"*). Por detrás, sin hacer esperar a quien la pide:
 *
 * 1. baja de sii.cl los tres ZIP (unos 190 MB) a una carpeta temporal;
 * 2. reparte los nombres por tramo de RUT en archivos (vienen sin orden);
 * 3. recorre las actividades y los domicilios, que vienen ordenados por RUT,
 *    de a tramo de 100.000 RUT: así nunca tiene más que un tramo en memoria;
 * 4. guarda una fila por empresa con actividades vigentes, de a mil, y al
 *    final borra las que ya no vienen.
 *
 * Una carga a la vez. Si algo falla, lo que había sigue (solo se borra al
 * final) y la carga queda «fallo» con el motivo.
 */
@Injectable()
export class NominaSiiService {
  /** Se cambian en las pruebas. */
  red: RedDelSii = redDelSii;
  minimoDeEmpresas = MINIMO_DE_EMPRESAS;
  private cargando = false;

  constructor(
    private readonly repo: NominaSiiRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(NominaSiiService.name);
  }

  /** La última carga y la que se está usando. */
  async estado() {
    const [ultima, lista] = await Promise.all([
      this.repo.ultimaCarga(),
      this.repo.ultimaLista(),
    ]);
    return { ultima, lista };
  }

  /** Empieza una carga por detrás y la devuelve. */
  async cargar(por: { id: string | null; nombre: string | null }) {
    const ultima = await this.repo.ultimaCarga();
    if (
      this.cargando ||
      (ultima?.estado === 'cargando' &&
        Date.now() - Date.parse(ultima.empezo_en) < CARGA_CAIDA_MS)
    )
      throw new ConflictException('La nómina del SII ya se está cargando.');
    const carga = await this.repo.empezarCarga(por);
    this.cargando = true;
    void this.correr(carga.id).finally(() => {
      this.cargando = false;
    });
    return carga;
  }

  /** La carga entera; nunca falla hacia afuera. */
  async correr(cargaId: number): Promise<void> {
    const carpeta = await mkdtemp(join(tmpdir(), 'nomina-sii-'));
    const empezo = Date.now();
    try {
      for (const archivo of Object.values(ARCHIVOS_DE_LA_NOMINA))
        await this.red.bajar(
          `${URL_DE_LA_NOMINA}${archivo.zip}`,
          join(carpeta, archivo.zip),
        );
      this.logger.info(
        `nómina del SII bajada en ${Math.round((Date.now() - empezo) / 1000)} s`,
      );
      await this.repartirNombres(carpeta);
      const empresas = await this.juntarYGuardar(carpeta, cargaId);
      if (empresas < this.minimoDeEmpresas)
        throw new Error(
          `la nómina trajo solo ${empresas} empresas: se deja la anterior`,
        );
      await this.repo.borrarLasDeOtrasCargas(cargaId);
      await this.repo.terminarCarga(cargaId, empresas);
      this.logger.info(
        `nómina del SII lista: ${empresas} empresas en ${Math.round((Date.now() - empezo) / 1000)} s`,
      );
    } catch (error) {
      const motivo = mensajeDe(error);
      this.logger.error(`la nómina del SII no se cargó: ${motivo}`);
      await this.repo.fallarCarga(cargaId, motivo).catch(() => undefined);
    } finally {
      await rm(carpeta, { recursive: true, force: true }).catch(
        () => undefined,
      );
    }
  }

  /** Las líneas de una entrada del ZIP, de a una. */
  private async lineasDe(
    carpeta: string,
    archivo: (typeof ARCHIVOS_DE_LA_NOMINA)[keyof typeof ARCHIVOS_DE_LA_NOMINA],
  ): Promise<AsyncIterable<string>> {
    const ruta = join(carpeta, archivo.zip);
    const entrada = (await entradasDelZip(ruta)).find(
      (e) => e.nombre === archivo.entrada,
    );
    if (!entrada) throw new Error(`${archivo.zip} no trae ${archivo.entrada}`);
    // Con freno: readline empezaba a leer al abrirse y perdía las líneas
    // que salían antes de recorrerlo, y con dos archivos abiertos a la vez
    // el que esperaba se acumulaba en memoria (764 MB medidos el 08-11).
    return lineasDelFlujo(await leerEntrada(ruta, entrada));
  }

  /** Los nombres vienen sin orden: se reparten por tramo de RUT en
   *  archivos, para leer después solo los del tramo que toca. */
  private async repartirNombres(carpeta: string) {
    const porTramo = new Map<number, string[]>();
    let enMemoria = 0;
    const vaciar = async () => {
      for (const [tramo, lineas] of porTramo)
        await appendFile(
          join(carpeta, `nombres-${tramo}.tsv`),
          lineas.join('\n') + '\n',
        );
      porTramo.clear();
      enMemoria = 0;
    };
    let columnas: string[] | null = null;
    for await (const linea of await this.lineasDe(
      carpeta,
      ARCHIVOS_DE_LA_NOMINA.nombres,
    )) {
      if (!columnas) {
        columnas = columnasDe(linea);
        continue;
      }
      const fila = filaDe(columnas, linea);
      const rut = rutDe(fila);
      if (rut == null || !fila.RAZON_SOCIAL) continue;
      const tramo = tramoDe(rut);
      const lineas = porTramo.get(tramo) ?? [];
      lineas.push(
        `${rut}\t${fila.DV}\t${fila.RAZON_SOCIAL.replace(/\t/g, ' ')}`,
      );
      porTramo.set(tramo, lineas);
      if (++enMemoria >= NOMBRES_EN_MEMORIA) await vaciar();
    }
    await vaciar();
  }

  private async nombresDelTramo(carpeta: string, tramo: number) {
    const nombres = new Map<number, { dv: string; razon_social: string }>();
    const ruta = join(carpeta, `nombres-${tramo}.tsv`);
    if (!existsSync(ruta)) return nombres;
    for (const linea of (await readFile(ruta, 'utf8')).split('\n')) {
      if (!linea) continue;
      const [rut, dv, razon_social] = linea.split('\t');
      nombres.set(Number(rut), { dv, razon_social });
    }
    return nombres;
  }

  /** Recorre las actividades y los domicilios de a tramo y guarda. */
  private async juntarYGuardar(carpeta: string, cargaId: number) {
    const actividades = new GruposEnOrden(
      porRut(
        await this.lineasDe(carpeta, ARCHIVOS_DE_LA_NOMINA.actividades),
        COLUMNAS_DE_ACTIVIDADES,
      ),
    );
    const domicilios = new GruposEnOrden(
      porRut(
        await this.lineasDe(carpeta, ARCHIVOS_DE_LA_NOMINA.domicilios),
        COLUMNAS_DE_DOMICILIOS,
      ),
    );
    let empresas = 0;
    let avisado = 0;
    let tanda: ContribuyenteDelSii[] = [];
    // El diccionario de actividades (unas setecientas): para elegir otro
    // giro al facturar.
    const diccionario = new Map<number, string>();
    const guardar = async () => {
      await this.repo.guardar(tanda, cargaId);
      empresas += tanda.length;
      tanda = [];
      if (empresas - avisado >= AVISO) {
        avisado = empresas;
        await this.repo.avanzarCarga(cargaId, empresas);
      }
    };
    for (let tramo = 0; tramo < TRAMOS; tramo++) {
      const limite =
        tramo === TRAMOS - 1
          ? Number.POSITIVE_INFINITY
          : (tramo + 1) * TAMANO_DEL_TRAMO;
      const deActividades = await actividades.hasta(limite);
      const deDomicilios = await domicilios.hasta(limite);
      if (!deActividades.size) continue;
      const nombres = await this.nombresDelTramo(carpeta, tramo);
      for (const [rut, filas] of deActividades) {
        for (const fila of filas) {
          const actividad = actividadDe(fila);
          if (actividad && !diccionario.has(actividad.codigo))
            diccionario.set(actividad.codigo, actividad.descripcion);
        }
        const empresa = contribuyenteDe(
          rut,
          nombres.get(rut),
          filas,
          deDomicilios.get(rut) ?? [],
        );
        if (!empresa) continue;
        tanda.push(empresa);
        if (tanda.length >= TANDA) await guardar();
      }
    }
    if (tanda.length) await guardar();
    await this.repo.guardarActividades(
      [...diccionario].map(([codigo, descripcion]) => ({
        codigo,
        descripcion,
      })),
    );
    return empresas;
  }

  /** La empresa de ese RUT canónico («76123456-7»), o nulo; el dígito
   *  verificador tiene que calzar. */
  async buscar(
    rut: string,
  ): Promise<(ContribuyenteDelSii & { giros: string[] }) | null> {
    const [numero, dv] = rut.split('-');
    const n = Number(numero);
    if (!Number.isInteger(n) || n <= 0) return null;
    const empresa = await this.repo.contribuyente(n);
    if (!empresa || empresa.dv.toUpperCase() !== (dv ?? '').toUpperCase())
      return null;
    // Las otras actividades, cortadas a lo que cabe, para elegir el giro.
    const descripciones = await this.repo.descripcionesDe(
      empresa.actividades ?? [],
    );
    const giros = [
      ...new Set(
        (empresa.actividades ?? [])
          .map((c) => descripciones.get(c))
          .filter((d): d is string => !!d)
          .map((d) => cortar(d, LARGO_MAXIMO.giro)),
      ),
    ];
    // El giro sale de la primera actividad con el corte de hoy (lo guardado
    // se cortó al cargar).
    return { ...empresa, giro: giros[0] ?? empresa.giro, giros };
  }
}
