import { HttpException, HttpStatus } from '@nestjs/common';

/**
 * GRUPOS DE UNA LISTA (12-10-2026, migraciones 120 y 121). Felipe: "un
 * cliente me pregunta por un paseo y debo tener dos o tres alternativas
 * juntas" y "mejor crear y editar listas". Las MISMAS reglas para los
 * grupos de paquetes ("Partir de un paquete") y los de menús guardados
 * ("Usar menú guardado", cada categoría con los suyos): una sola pieza,
 * para que una mejora llegue a las dos listas de una vez.
 *
 * Cada módulo le presta su tabla ya filtrada por empresa (y por
 * categoría, en los menús); acá viven las reglas:
 *  - el nombre llega recortado y nunca vacío (400);
 *  - un nombre repetido es 409 en castellano;
 *  - un grupo nuevo va al final del orden;
 *  - ordenar descarta los id que no son de la lista;
 *  - renombrar o borrar uno ajeno o inexistente es 404.
 */

type Respuesta = PromiseLike<{ data: unknown; error: unknown }>;

export interface TablaDeGrupos {
  listar: () => Respuesta;
  crear: (name: string, sortOrder: number) => Respuesta;
  renombrar: (id: number, name: string) => Respuesta;
  ordenar: (id: number, sortOrder: number) => PromiseLike<{ error: unknown }>;
  borrar: (id: number) => Respuesta;
}

export interface GrupoListado {
  id: number;
  name: string;
  sort_order: number;
}

interface Registro {
  error: (obj: unknown) => void;
}

const REPETIDO = 'Ya existe un grupo con ese nombre. Elige otro.';

export const nombreValido = (nombre: string, que: string) => {
  const name = (nombre ?? '').trim();
  if (!name) {
    throw new HttpException(
      `El nombre del ${que} no puede quedar vacío`,
      HttpStatus.BAD_REQUEST,
    );
  }
  return name;
};

/** Error de la base → aviso en castellano. 23505 = nombre repetido. */
export const fallar = (
  logger: Registro,
  error: unknown,
  mensaje: string,
  repetido?: string,
): never => {
  if (repetido && (error as { code?: string })?.code === '23505') {
    throw new HttpException(repetido, HttpStatus.CONFLICT);
  }
  logger.error(error);
  throw new HttpException(mensaje, HttpStatus.INTERNAL_SERVER_ERROR);
};

const filas = (data: unknown): unknown[] =>
  Array.isArray(data) ? (data as unknown[]) : [];

export class ReglasDeGrupos {
  constructor(
    private readonly tabla: TablaDeGrupos,
    private readonly logger: Registro,
  ) {}

  async listar(): Promise<GrupoListado[]> {
    const { data, error } = await this.tabla.listar();
    if (error) fallar(this.logger, error, 'No se pudieron leer los grupos');
    return filas(data) as GrupoListado[];
  }

  /** Un grupo nuevo va al final del orden. */
  async crear(nombre: string) {
    const name = nombreValido(nombre, 'grupo');
    const actuales = await this.listar();
    const siguiente =
      actuales.reduce((max, g) => Math.max(max, g.sort_order ?? 0), 0) + 1;
    const { data, error } = await this.tabla.crear(name, siguiente);
    if (error)
      fallar(this.logger, error, 'No se pudo crear el grupo', REPETIDO);
    return data;
  }

  async renombrar(id: number, nombre: string) {
    const name = nombreValido(nombre, 'grupo');
    const { data, error } = await this.tabla.renombrar(id, name);
    if (error) {
      fallar(this.logger, error, 'No se pudo renombrar el grupo', REPETIDO);
    }
    const [grupo] = filas(data);
    if (!grupo) {
      throw new HttpException('Grupo no encontrado', HttpStatus.NOT_FOUND);
    }
    return grupo as GrupoListado;
  }

  /** Guarda el orden que llega, del 1 en adelante. Los id que no son de
   *  la lista se descartan sin aviso (igual que los tipos de cliente). */
  async ordenar(ids: number[]) {
    const propios = new Set((await this.listar()).map((g) => g.id));
    const orden = ids.filter((id) => propios.has(id));
    for (const [i, id] of orden.entries()) {
      const { error } = await this.tabla.ordenar(id, i + 1);
      if (error) fallar(this.logger, error, 'No se pudo ordenar los grupos');
    }
    return this.listar();
  }

  /** Borrar un grupo NO borra lo que tenía: queda sin grupo, en "Otros"
   *  (ON DELETE SET NULL en las dos tablas). */
  async borrar(id: number) {
    const { data, error } = await this.tabla.borrar(id);
    if (error) fallar(this.logger, error, 'No se pudo borrar el grupo');
    if (filas(data).length === 0) {
      throw new HttpException('Grupo no encontrado', HttpStatus.NOT_FOUND);
    }
    return { removed: true };
  }
}
