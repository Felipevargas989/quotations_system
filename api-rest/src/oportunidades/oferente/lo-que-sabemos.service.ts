import {
  Injectable,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { MarcaDeExigencia } from '../ficha/ficha.repository';
import {
  guardarRespuestas,
  reemplazarTodas,
  type RespuestaDeLaEmpresa,
} from './lo-que-sabemos';
import {
  LoQueSabemosRepository,
  type NuevaRespuesta,
} from './lo-que-sabemos.repository';

// LO QUE EVENTIA SABE DE TU EMPRESA (decisión 119, parte 3; migración 190):
// guardar, cambiar y borrar, y tenerlo en la memoria del motor para que
// `loQueSabeLaCasa` lo sume sin ir a la base en cada pedido. Si la base no
// responde (o la migración 190 todavía no está), Oportunidades sigue como
// antes: no recuerda, y «Armar postulación» no pregunta.

export const MINUTOS_PARA_REFRESCAR = 5;

/** Lo que la IA ya sabía de una exigencia («¿Puedo cumplir?»). */
export type LoQueDeciaLaIA = { que: string; estado: string };

@Injectable()
export class LoQueSabemosService implements OnModuleInit, OnModuleDestroy {
  private reloj: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly repo: LoQueSabemosRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(LoQueSabemosService.name);
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

  /** Las de todas las empresas, a la memoria. */
  async cargarTodas(): Promise<void> {
    try {
      const porEmpresa = new Map<number, RespuestaDeLaEmpresa[]>();
      for (const r of await this.repo.deTodas()) {
        porEmpresa.set(r.company_id, [
          ...(porEmpresa.get(r.company_id) ?? []),
          r,
        ]);
      }
      reemplazarTodas(porEmpresa);
    } catch (e) {
      this.logger.warn(`lo que sabemos: no pude cargarlo: ${mensajeDe(e)}`);
    }
  }

  /** Las de una empresa, de nuevo a la memoria (después de un cambio). */
  async refrescar(empresa: number): Promise<void> {
    try {
      guardarRespuestas(empresa, await this.repo.deLaEmpresa(empresa));
    } catch (e) {
      this.logger.warn(
        `lo que sabemos de la empresa ${empresa}: no pude refrescarlo: ${mensajeDe(e)}`,
      );
    }
  }

  /** Todo lo de la empresa, lo más nuevo primero («Mi empresa»). */
  lista(empresa: number): Promise<RespuestaDeLaEmpresa[]> {
    return this.repo.deLaEmpresa(empresa);
  }

  /** Lo que respondió en el modal de «Armar postulación». */
  async responder(empresa: number, filas: NuevaRespuesta[]): Promise<void> {
    await this.repo.guardar(empresa, filas);
    await this.refrescar(empresa);
  }

  async cambiar(
    empresa: number,
    id: number,
    cambios: { respuesta?: MarcaDeExigencia; detalle?: string | null },
  ): Promise<RespuestaDeLaEmpresa> {
    const fila = await this.repo.cambiar(empresa, id, cambios);
    if (!fila) throw new NotFoundException('No encontramos esa respuesta.');
    await this.refrescar(empresa);
    return fila;
  }

  async borrar(empresa: number, id: number): Promise<void> {
    if (!(await this.repo.borrar(empresa, id))) {
      throw new NotFoundException('No encontramos esa respuesta.');
    }
    await this.refrescar(empresa);
  }

  /** Lo que se marca en «Bases y criterios» (decisión 37) también se
   *  aprende, si la IA no lo sabía: desmarcar lo olvida, y una marca igual
   *  a lo que decía la IA deja la memoria sin esa exigencia (no le enseña
   *  nada y no contradice lo de antes). Nunca lanza. */
  async alMarcar(
    empresa: number,
    oportunidadId: number,
    clave: string,
    marca: MarcaDeExigencia | null,
    laIA: LoQueDeciaLaIA | null,
  ): Promise<void> {
    try {
      const yaLoSabia =
        (marca === 'lo_tengo' && laIA?.estado === 'tengo') ||
        (marca === 'no_puedo' && laIA?.estado === 'no_se_puede');
      if (!marca || yaLoSabia) {
        await this.repo.borrarPorClave(empresa, clave);
      } else {
        const antes = await this.repo.porClave(empresa, clave);
        if (antes?.respuesta === marca) return;
        await this.repo.guardar(empresa, [
          {
            clave,
            // Si ya estaba, se queda su pregunta; el detalle era de la
            // otra respuesta.
            pregunta: (antes?.pregunta ?? laIA?.que ?? clave).slice(0, 400),
            exigencia: antes?.exigencia ?? laIA?.que.slice(0, 1000) ?? null,
            respuesta: marca,
            detalle: null,
            oportunidad_id: oportunidadId,
          },
        ]);
      }
      await this.refrescar(empresa);
    } catch (e) {
      this.logger.warn(
        `lo que sabemos de la empresa ${empresa}: no pude aprender la marca: ${mensajeDe(e)}`,
      );
    }
  }
}
