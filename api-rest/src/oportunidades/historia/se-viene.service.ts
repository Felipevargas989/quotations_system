import { Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import { costoEnDolares } from '../analisis/comun';
import {
  LECTURA_ACTUAL,
  LecturaDetenida,
  LecturaService,
  MODELO_LECTURA,
  type Uso,
} from '../lectura/lectura.service';
import { aplicarReglas, type Semaforo } from '../lectura/reglas';
import { OportunidadesRepository } from '../oportunidades.repository';
import type { SeViene } from './mercado';
import { SeVieneRepository } from './se-viene.repository';

// «SE VIENE» CON EL SEMÁFORO DE LA BANDEJA (decisión 62 del doc 17, 20-10).
// Felipe: "deberíamos filtrar con el mismo semáforo, no tiene sentido
// analizar 400 opciones". Cada serie se lee una vez, por su última vez, con
// la misma lectura del radar (Haiku 5.5, las instrucciones de la empresa y
// las reglas fijas: comuna cercana y del rubro nunca es roja), y queda
// guardada (`oportunidades_se_viene`, migración 156). Lo que falta se lee
// por detrás al abrir «Se viene»: la pantalla pregunta cómo va.

/** Cuántas lecturas a la vez: la primera vez son unas 400. */
const LECTORES = 6;

/** Lo que no se pudo leer se reintenta recién después de esto: así la
 *  pantalla no vuelve a mandar a leer, cada vez, lo que siempre falla. */
const REINTENTAR_MS = 60 * 60 * 1000;

export type SeVieneConSemaforo = SeViene & {
  /** null: todavía sin leer. */
  semaforo: Semaforo | null;
  razon: string | null;
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
  ) {
    this.logger.setContext(SeVieneService.name);
  }

  /** A cada serie, su semáforo guardado. Lo que falta se manda a leer por
   *  detrás (sin esperar): la respuesta sale al tiro, con null. */
  async conSemaforo(
    companyId: number,
    series: SeViene[],
    opciones: OpcionesDeLectura,
  ): Promise<SeVieneConSemaforo[]> {
    if (series.length === 0) return [];
    const codigos = [...new Set(series.map((s) => s.ultima.codigo))];
    const leidas = await this.repo.lecturas(companyId, codigos);
    const ahora = Date.now();
    const faltan = codigos.filter((c) => {
      if (leidas.has(c)) return false;
      const fallo = this.fallidas.get(`${companyId}:${c}`);
      return !fallo || ahora - fallo > REINTENTAR_MS;
    });
    if (faltan.length > 0) this.leerPorDetras(companyId, faltan, opciones);
    return series.map((s) => {
      const l = leidas.get(s.ultima.codigo);
      return { ...s, semaforo: l?.semaforo ?? null, razon: l?.razon ?? null };
    });
  }

  estado(companyId: number): LecturaDeSeViene {
    const enCurso = this.enCurso.get(companyId);
    return enCurso
      ? { leyendo: true, ...enCurso }
      : { leyendo: false, leidas: 0, total: 0 };
  }

  private leerPorDetras(
    companyId: number,
    codigos: string[],
    opciones: OpcionesDeLectura,
  ): void {
    if (!this.lectura.configurado || this.enCurso.has(companyId)) return;
    this.enCurso.set(companyId, { leidas: 0, total: codigos.length });
    void this.leer(companyId, codigos, opciones)
      .catch((error: unknown) =>
        this.logger.warn(
          `se viene: la lectura de la empresa ${companyId} se cortó: ${mensajeDe(error)}`,
        ),
      )
      .finally(() => this.enCurso.delete(companyId));
  }

  /** Lee de a LECTORES a la vez y guarda cada una apenas sale. Si la
   *  cuenta falla, para; lo que quedó se reintenta en una hora. Devuelve
   *  cuántas guardó. */
  async leer(
    companyId: number,
    codigos: string[],
    opciones: OpcionesDeLectura,
  ): Promise<number> {
    const [procesos, nombre, catalogo] = await Promise.all([
      this.repo.procesosParaLeer(codigos),
      this.repo.nombreDeLaEmpresa(companyId),
      this.oportunidades.catalogoResumido(companyId),
    ]);
    const perfil = { nombre, perfil: opciones.perfil, ...catalogo };
    const uso: Uso = { entrada: 0, salida: 0 };
    const avance = this.enCurso.get(companyId);
    const fallar = (codigo: string) =>
      this.fallidas.set(`${companyId}:${codigo}`, Date.now());
    const cola = [...procesos];
    let guardadas = 0;
    let detenida = false;

    const lector = async () => {
      for (let p = cola.shift(); p && !detenida; p = cola.shift()) {
        try {
          const lectura = await this.lectura.leer(p, perfil, uso);
          if (lectura) {
            const final = aplicarReglas(lectura, p, {
              comunasCercanas: opciones.comunasCercanas,
              umbralAltoValor: opciones.umbralAltoValor,
            });
            await this.repo.guardar(companyId, p.codigo, final, LECTURA_ACTUAL);
            guardadas++;
          } else {
            fallar(p.codigo);
          }
        } catch (error) {
          fallar(p.codigo);
          if (error instanceof LecturaDetenida) {
            detenida = true;
            this.logger.warn(`se viene: ${error.message}`);
          } else {
            this.logger.warn(
              `se viene: no se guardó la lectura de ${p.codigo}: ${mensajeDe(error)}`,
            );
          }
        }
        if (avance) avance.leidas++;
      }
    };
    await Promise.all(Array.from({ length: LECTORES }, lector));

    // Lo que no alcanzó (la cuenta falló) o no estaba en la historia.
    const vistas = new Set(procesos.map((p) => p.codigo));
    for (const c of codigos) if (!vistas.has(c)) fallar(c);
    for (const p of cola) fallar(p.codigo);

    this.logger.info(
      `se viene: ${guardadas} de ${codigos.length} series leídas para la empresa ${companyId}, ${uso.entrada} tokens de entrada, ${uso.salida} de salida, US$${costoEnDolares(uso.entrada, uso.salida, MODELO_LECTURA)}`,
    );
    return guardadas;
  }
}
