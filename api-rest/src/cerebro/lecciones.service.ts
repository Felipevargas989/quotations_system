import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import {
  guardarAprobadas,
  reemplazarTodas,
  type EstadoDeLeccion,
  type Leccion,
} from './lecciones';
import { LeccionesRepository, type NuevaLeccion } from './lecciones.repository';

// LAS LECCIONES, EN LA MEMORIA DEL MOTOR (doc 20 §17, mejora 5). Las
// aprobadas se traen al arrancar, cada 5 minutos y apenas una cambia, para
// que `cerebroPara` las sume sin ir a la base en cada pregunta. Si la base
// no responde (o la migración 185 todavía no está), cada IA sigue con los
// archivos del cerebro: nada se corta.

export const MINUTOS_PARA_REFRESCAR = 5;

@Injectable()
export class LeccionesService implements OnModuleInit, OnModuleDestroy {
  private reloj: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly repositorio: LeccionesRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LeccionesService.name);
  }

  async onModuleInit(): Promise<void> {
    await this.cargarTodas();
    this.reloj = setInterval(
      () => void this.cargarTodas(),
      MINUTOS_PARA_REFRESCAR * 60_000,
    );
    this.reloj.unref?.();
  }

  onModuleDestroy(): void {
    if (this.reloj) clearInterval(this.reloj);
  }

  /** Las aprobadas de todas las empresas, a la memoria. */
  async cargarTodas(): Promise<void> {
    try {
      const todas = await this.repositorio.aprobadasDeTodas();
      const porEmpresa = new Map<number, Leccion[]>();
      for (const l of todas) {
        porEmpresa.set(l.company_id, [
          ...(porEmpresa.get(l.company_id) ?? []),
          l,
        ]);
      }
      reemplazarTodas(porEmpresa);
    } catch (e) {
      this.logger.warn(`lecciones: no pude cargarlas: ${mensajeDe(e)}`);
    }
  }

  /** Las de una empresa, de nuevo a la memoria (después de un cambio). */
  async refrescar(empresa: number): Promise<void> {
    try {
      guardarAprobadas(empresa, await this.repositorio.aprobadas(empresa));
    } catch (e) {
      this.logger.warn(
        `lecciones de la empresa ${empresa}: no pude refrescarlas: ${mensajeDe(e)}`,
      );
    }
  }

  vivas(empresa: number): Promise<Leccion[]> {
    return this.repositorio.vivas(empresa);
  }

  una(empresa: number, id: string): Promise<Leccion | null> {
    return this.repositorio.una(empresa, id);
  }

  async crear(fila: NuevaLeccion): Promise<Leccion> {
    const l = await this.repositorio.crear(fila);
    if (l.estado === 'aprobada') await this.refrescar(fila.company_id);
    return l;
  }

  async mover(
    empresa: number,
    id: string,
    desde: EstadoDeLeccion,
    cambio: {
      estado: EstadoDeLeccion;
      decidida_por: string | null;
      decidida_por_nombre: string | null;
    },
  ): Promise<Leccion | null> {
    const l = await this.repositorio.mover(empresa, id, desde, cambio);
    if (l) await this.refrescar(empresa);
    return l;
  }
}
