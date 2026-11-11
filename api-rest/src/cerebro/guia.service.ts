import {
  BadRequestException,
  Injectable,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { User } from 'src/users/entities/user.entity';
import {
  guardarGuia,
  limpiarGuia,
  reemplazarGuias,
  type Guia,
  type SeccionDeGuia,
} from './guia';
import { GuiaRepository } from './guia.repository';
import { MINUTOS_PARA_REFRESCAR } from './lecciones.service';

// LA GUÍA DE LA CASA, EN LA MEMORIA DEL MOTOR (doc 20 §18). Como las
// lecciones: se trae al arrancar, cada 5 minutos y apenas administración la
// guarda. Si la base no responde (o la migración 202 todavía no está), cada
// IA sigue con los archivos del cerebro: nada se corta.

@Injectable()
export class GuiaService implements OnModuleInit, OnModuleDestroy {
  private reloj: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly repositorio: GuiaRepository,
    private readonly logger: PinoLogger,
  ) {
    this.logger.setContext(GuiaService.name);
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

  async cargarTodas(): Promise<void> {
    try {
      reemplazarGuias(await this.repositorio.todas());
    } catch (e) {
      this.logger.warn(`guía de la casa: no pude cargarlas: ${mensajeDe(e)}`);
    }
  }

  leer(empresa: number): Promise<Guia> {
    return this.repositorio.de(empresa);
  }

  /** Guarda la guía entera (la pantalla manda todos los temas) y la deja
   *  al tiro en la memoria del motor. */
  async guardar(
    usuario: User,
    entrada: Array<{ titulo?: unknown; texto?: unknown }>,
  ): Promise<Guia> {
    const limpia: SeccionDeGuia[] | string = limpiarGuia(entrada);
    if (typeof limpia === 'string') throw new BadRequestException(limpia);
    const guia = await this.repositorio.guardar(usuario.company_id, limpia, {
      id: usuario.id ?? null,
      nombre: usuario.full_name ?? null,
    });
    guardarGuia(usuario.company_id, guia.secciones);
    this.logger.info(
      `guía de la casa de la empresa ${usuario.company_id}: ${guia.secciones.length} temas`,
    );
    return guia;
  }
}
