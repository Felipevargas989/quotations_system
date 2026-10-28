import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { costoEnDolares } from '../analisis/comun';
import { MercadoDeLaZonaRepository } from '../datos-abiertos/mercado-de-la-zona.repository';
import {
  LECTURA_ACTUAL,
  LecturaDetenida,
  LecturaService,
  MODELO_LECTURA,
  type ProcesoParaLeer,
  type Uso,
} from '../lectura/lectura.service';
import { aplicarReglas, esDelRubro, type Semaforo } from '../lectura/reglas';
import { OportunidadesRepository } from '../oportunidades.repository';
import type { ProcesoDeLaZona, SeViene } from './mercado';
import {
  aniosConEdiciones,
  type Candidata,
  candidatasDe,
  montoDe,
  preguntaDeRepeticion,
} from './repeticion';
import { type LecturaDeSerie, SeVieneRepository } from './se-viene.repository';

// «SE VIENE» CON EL SEMÁFORO DE LA BANDEJA (decisión 62 del doc 17, 20-10).
// Felipe: "deberíamos filtrar con el mismo semáforo, no tiene sentido
// analizar 400 opciones". Cada serie se lee una vez, por su última vez, con
// la misma lectura del radar (Haiku 5.5, las instrucciones de la empresa y
// las reglas fijas de `aplicarReglas`), y queda guardada
// (`oportunidades_se_viene`, migración 156). Lo que falta se lee por detrás
// al abrir «Se viene»: la pantalla pregunta cómo va. Como en el radar
// (decisión 19), lo leído con otras reglas se vuelve a leer, solo el color.
// Desde la decisión 72 (23-10) el rojo de tu zona y de tu rubro es el
// reciclaje, y el resto del rojo, la basura (`reciclaje`).
//
// Desde la decisión 63 (esa misma noche), la IA también dice si se repite:
// cuáles licitaciones de años anteriores del mismo comprador son ediciones
// del mismo evento, aunque el nombre cambie (`repeticion.ts`, migración
// 157). Y la empresa puede descartar una serie que cree que no vuelve.

/** Cuántas lecturas a la vez: la primera vez son unas 400. */
const LECTORES = 6;

/** Lo que no se pudo leer se reintenta recién después de esto: así la
 *  pantalla no vuelve a mandar a leer, cada vez, lo que siempre falla. */
const REINTENTAR_MS = 60 * 60 * 1000;

export type SeVieneConSemaforo = SeViene & {
  /** null: todavía sin leer. */
  semaforo: Semaforo | null;
  razon: string | null;
  /** Según la IA: true si tiene ediciones anteriores, false si salió una
   *  sola vez, null si todavía no lo revisa. */
  repite: boolean | null;
  repeticion: string | null;
  descartada: boolean;
  /** Roja, de una comuna cercana y del rubro: lo que la IA rechazó pero
   *  vale una mirada (decisión 72). Una roja sin esto es la basura. */
  reciclaje: boolean;
};

/** Cómo va la lectura de una empresa: lo que ve la pantalla mientras tanto. */
export type LecturaDeSeViene = {
  leyendo: boolean;
  leidas: number;
  total: number;
};

export type OpcionesDeLectura = {
  comunasCercanas: string[];
  umbralAltoValor: number | null;
  perfil: string | null;
};

/** Lo que falta de una serie: el semáforo, si se repite, o los dos. */
type Tarea = {
  codigo: string;
  semaforo: boolean;
  repeticion: boolean;
  ultima: Candidata;
  candidatas: Candidata[];
};

@Injectable()
export class SeVieneService {
  /** La lectura en curso de cada empresa: una a la vez por empresa. */
  private readonly enCurso = new Map<
    number,
    { leidas: number; total: number }
  >();
  /** Lo que no se pudo leer, por empresa y código, y cuándo. */
  private readonly fallidas = new Map<string, number>();

  constructor(
    private readonly repo: SeVieneRepository,
    private readonly oportunidades: OportunidadesRepository,
    private readonly lectura: LecturaService,
    private readonly logger: PinoLogger,
    /** Decisión 106: la serie puede venir del mercado de ChileCompra, y su
     *  última vez no estar guardada por el radar. Opcional: las pruebas de
     *  antes no lo traen. */
    @Optional() private readonly mercado?: MercadoDeLaZonaRepository,
  ) {
    this.logger.setContext(SeVieneService.name);
  }

  /** A cada serie, su semáforo y si se repite, guardados. Lo que falta se
   *  manda a leer por detrás (sin esperar): la respuesta sale al tiro, con
   *  null. `procesos` son los de la zona: de ahí salen las candidatas a
   *  ediciones anteriores. */
  async conSemaforo(
    companyId: number,
    series: SeViene[],
    procesos: readonly ProcesoDeLaZona[],
    opciones: OpcionesDeLectura,
  ): Promise<SeVieneConSemaforo[]> {
    if (series.length === 0) return [];
    const codigos = [...new Set(series.map((s) => s.ultima.codigo))];
    const leidas = await this.repo.lecturas(companyId, codigos);
    const porCodigo = new Map(procesos.map((p) => [p.codigo, p]));

    const ahora = Date.now();
    const tareas: Tarea[] = [];
    for (const codigo of codigos) {
      const l = leidas.get(codigo);
      // Leída con otras reglas: se relee el color, no si se repite. Las
      // descartadas no, ya no se miran.
      const releer =
        l !== undefined && l.modelo !== LECTURA_ACTUAL && !l.descartada_en;
      if (l && l.ediciones !== null && !releer) continue;
      const fallo = this.fallidas.get(`${companyId}:${codigo}`);
      if (fallo && ahora - fallo <= REINTENTAR_MS) continue;
      const ultima = porCodigo.get(codigo);
      if (!ultima) continue;
      tareas.push({
        codigo,
        semaforo: !l || releer,
        repeticion: !l || l.ediciones === null,
        ultima: {
          codigo,
          nombre: ultima.nombre,
          fecha_publicacion: ultima.fecha_publicacion ?? '',
          monto: montoDe(ultima),
        },
        candidatas: candidatasDe(ultima, procesos),
      });
    }
    if (tareas.length > 0) this.leerPorDetras(companyId, tareas, opciones);

    const fechaDe = (c: string) => porCodigo.get(c)?.fecha_publicacion ?? null;
    return series.map((s) =>
      this.conLoLeido(s, leidas.get(s.ultima.codigo), fechaDe),
    );
  }

  private conLoLeido(
    s: SeViene,
    l: LecturaDeSerie | undefined,
    fechaDe: (codigo: string) => string | null,
  ): SeVieneConSemaforo {
    const ediciones = l?.ediciones ?? null;
    return {
      ...s,
      // Los años, los que dice la IA cuando ya lo revisó.
      anios: ediciones
        ? aniosConEdiciones(s.ultima.codigo, ediciones, fechaDe)
        : s.anios,
      semaforo: l?.semaforo ?? null,
      razon: l?.razon ?? null,
      repite: ediciones ? ediciones.length > 0 : null,
      repeticion: l?.repeticion ?? null,
      descartada: Boolean(l?.descartada_en),
      reciclaje:
        l?.semaforo === 'rojo' &&
        s.comuna_cercana &&
        esDelRubro(l.etiquetas ?? []),
    };
  }

  estado(companyId: number): LecturaDeSeViene {
    const enCurso = this.enCurso.get(companyId);
    return enCurso
      ? { leyendo: true, ...enCurso }
      : { leyendo: false, leidas: 0, total: 0 };
  }

  /** «Descartar» (o recuperar) una serie: Felipe, "si es que yo siento que
   *  no se va a repetir". Si igual sale, el radar la trae a la bandeja. */
  async descartar(
    companyId: number,
    codigo: string,
    descartada: boolean,
  ): Promise<{ codigo: string; descartada: boolean }> {
    const hecho = await this.repo.descartar(companyId, codigo, descartada);
    if (!hecho) {
      throw new NotFoundException(
        'Esa licitación todavía no está leída en «Se viene».',
      );
    }
    return { codigo, descartada };
  }

  private leerPorDetras(
    companyId: number,
    tareas: Tarea[],
    opciones: OpcionesDeLectura,
  ): void {
    if (!this.lectura.configurado || this.enCurso.has(companyId)) return;
    this.enCurso.set(companyId, { leidas: 0, total: tareas.length });
    void this.leer(companyId, tareas, opciones)
      .catch((error: unknown) =>
        this.logger.warn(
          `se viene: la lectura de la empresa ${companyId} se cortó: ${mensajeDe(error)}`,
        ),
      )
      .finally(() => this.enCurso.delete(companyId));
  }

  /** Lee de a LECTORES a la vez: primero el semáforo (si falta) y después
   *  si se repite, y guarda cada cosa apenas sale. Si la cuenta falla, para;
   *  lo que quedó se reintenta en una hora. Devuelve cuántas series
   *  quedaron completas. */
  async leer(
    companyId: number,
    tareas: Tarea[],
    opciones: OpcionesDeLectura,
  ): Promise<number> {
    const sinSemaforo = tareas.filter((t) => t.semaforo).map((t) => t.codigo);
    const [procesos, nombre, catalogo] = await Promise.all([
      sinSemaforo.length > 0
        ? this.repo.procesosParaLeer(sinSemaforo)
        : Promise.resolve([] as ProcesoParaLeer[]),
      this.repo.nombreDeLaEmpresa(companyId),
      this.oportunidades.catalogoResumido(companyId),
    ]);
    // Las que el radar no guardó se leen con lo que trae el mercado: el
    // nombre y los rubros de lo que se compró (decisión 106).
    const faltan = sinSemaforo.filter(
      (c) => !procesos.some((p) => p.codigo === c),
    );
    if (faltan.length > 0 && this.mercado) {
      procesos.push(...(await this.mercado.paraLeer(faltan)));
    }
    const paraLeer = new Map(procesos.map((p) => [p.codigo, p]));
    const perfil = { nombre, perfil: opciones.perfil, ...catalogo };
    const uso: Uso = { entrada: 0, salida: 0 };
    const avance = this.enCurso.get(companyId);
    const fallar = (codigo: string) =>
      this.fallidas.set(`${companyId}:${codigo}`, Date.now());
    const cola = [...tareas];
    let completas = 0;
    let detenida = false;

    /** El semáforo: la lectura del radar con sus reglas. false si no
     *  quedó (la serie no sigue). */
    const leerSemaforo = async (t: Tarea): Promise<boolean> => {
      const p = paraLeer.get(t.codigo);
      if (!p) return false;
      const lectura = await this.lectura.leer(p, perfil, uso);
      if (!lectura) return false;
      const final = aplicarReglas(lectura, p, {
        comunasCercanas: opciones.comunasCercanas,
        umbralAltoValor: opciones.umbralAltoValor,
      });
      await this.repo.guardar(companyId, t.codigo, final, LECTURA_ACTUAL);
      return true;
    };

    /** Si se repite: sin candidatas, salió una sola vez (sin IA). */
    const leerRepeticion = async (t: Tarea): Promise<boolean> => {
      if (t.candidatas.length === 0) {
        await this.repo.guardarRepeticion(
          companyId,
          t.codigo,
          [],
          'No hay otra licitación de este comprador en los años anteriores.',
        );
        return true;
      }
      const r = await this.lectura.edicionesAnteriores(
        preguntaDeRepeticion(t.ultima, t.candidatas),
        t.candidatas,
        uso,
      );
      if (!r) return false;
      await this.repo.guardarRepeticion(
        companyId,
        t.codigo,
        r.anteriores,
        r.razon,
      );
      return true;
    };

    const lector = async () => {
      for (let t = cola.shift(); t && !detenida; t = cola.shift()) {
        try {
          const listo =
            (!t.semaforo || (await leerSemaforo(t))) &&
            (!t.repeticion || (await leerRepeticion(t)));
          if (listo) completas++;
          else fallar(t.codigo);
        } catch (error) {
          fallar(t.codigo);
          if (error instanceof LecturaDetenida) {
            detenida = true;
            this.logger.warn(`se viene: ${error.message}`);
          } else {
            this.logger.warn(
              `se viene: no se guardó la lectura de ${t.codigo}: ${mensajeDe(error)}`,
            );
          }
        }
        if (avance) avance.leidas++;
      }
    };
    await Promise.all(Array.from({ length: LECTORES }, lector));

    // Lo que no alcanzó, porque la cuenta falló.
    for (const t of cola) fallar(t.codigo);

    this.logger.info(
      `se viene: ${completas} de ${tareas.length} series leídas para la empresa ${companyId}, ${uso.entrada} tokens de entrada, ${uso.salida} de salida, US$${costoEnDolares(uso.entrada, uso.salida, MODELO_LECTURA)}`,
    );
    return completas;
  }
}
