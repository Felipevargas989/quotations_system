import { BadRequestException, Injectable } from '@nestjs/common';
import { PinoLogger } from 'nestjs-pino';
import { mensajeDe } from 'src/logging/mensaje-de-error';
import type { User, UserRole } from 'src/users/entities/user.entity';
import {
  ConversacionRepository,
  type TurnoGuardado,
} from './conversacion.repository';
import { LoLeido } from './lo-leido';

// LA CONVERSACIÓN DE CADA PERSONA (doc 20 §13; Felipe, 04-11-2026: "que
// vaya guardando como cierto contexto cuando se cierra la ventana ... por
// cada usuario"). Sigue al cerrar la ventana, al otro día y desde otro
// equipo. Tres reglas:
// - es solo de esa persona: se busca con la sesión, nunca con un id que
//   mande el navegador;
// - si a la persona le cambian el cargo, parte de cero, para que no
//   arrastre lo que vio con el anterior ("limitado a sus roles");
// - se borra sola a los 90 días sin uso.

/** Los turnos que se guardan: los mismos que muestra la ventanilla. */
export const MAX_TURNOS_GUARDADOS = 30;

/** Días sin uso para que una conversación se borre sola. */
export const DIAS_SIN_USO = 90;

/** Lo más que pesa una conversación guardada (el motor recibe hasta
 *  100 KB): si pasa, salen los turnos más viejos. */
export const MAX_CARACTERES = 90_000;

const DIA_MS = 86_400_000;

/** Los 30 más nuevos, y menos si pesan demasiado. Siempre queda el último. */
export const recortar = (turnos: TurnoGuardado[]): TurnoGuardado[] => {
  let t = turnos.slice(-MAX_TURNOS_GUARDADOS);
  while (t.length > 1 && JSON.stringify(t).length > MAX_CARACTERES) {
    t = t.slice(1);
  }
  return t;
};

/** Sin uso desde antes de esta fecha, la conversación ya no vale. */
export const limiteSinUso = (ahora: number = Date.now()): string =>
  new Date(ahora - DIAS_SIN_USO * DIA_MS).toISOString();

@Injectable()
export class ConversacionService {
  constructor(
    private readonly repositorio: ConversacionRepository,
    private readonly logger: PinoLogger,
    // Lo que BelIA ya leyó se olvida con la conversación (04-11-2026).
    private readonly loLeido: LoLeido = new LoLeido(),
  ) {
    this.logger.setContext(ConversacionService.name);
  }

  /** La conversación de la sesión, o vacía si no hay, si venció o si se
   *  conversó con otro cargo (en esos dos casos, además, se borra). */
  async leer(usuario: User): Promise<TurnoGuardado[]> {
    const { empresa, persona } = quienEs(usuario);
    const fila = await this.repositorio.leer(empresa, persona);
    if (!fila) return [];
    const vencida = Date.parse(fila.updated_at) < Date.parse(limiteSinUso());
    if (fila.cargo !== usuario.role || vencida) {
      await this.repositorio.borrar(empresa, persona);
      return [];
    }
    return Array.isArray(fila.turnos) ? fila.turnos : [];
  }

  /** Guarda la conversación, salvo que se haya conversado con otro cargo:
   *  el que cree tener la pantalla (`cargo`) o el de la que estaba guardada.
   *  En ese caso la borra y avisa, y la ventanilla parte de cero. */
  async guardar(
    usuario: User,
    cargo: UserRole,
    turnos: TurnoGuardado[],
  ): Promise<{ reiniciada: boolean }> {
    const { empresa, persona } = quienEs(usuario);
    const fila =
      cargo === usuario.role
        ? await this.repositorio.leer(empresa, persona)
        : null;
    if (cargo !== usuario.role || (fila && fila.cargo !== usuario.role)) {
      await this.repositorio.borrar(empresa, persona);
      this.loLeido.olvidar(usuario);
      return { reiniciada: true };
    }
    await this.repositorio.guardar(
      empresa,
      persona,
      usuario.role,
      recortar(turnos),
    );
    // Las de la empresa que llevan 90 días sin uso, de paso. Si falla, la
    // conversación ya quedó guardada.
    await this.repositorio
      .borrarSinUso(empresa, limiteSinUso())
      .catch((e: unknown) =>
        this.logger.warn(`BelIA, conversaciones sin uso: ${mensajeDe(e)}`),
      );
    return { reiniciada: false };
  }

  /** «Nueva conversación». */
  async borrar(usuario: User): Promise<void> {
    const { empresa, persona } = quienEs(usuario);
    await this.repositorio.borrar(empresa, persona);
    this.loLeido.olvidar(usuario);
  }
}

const quienEs = (usuario: User): { empresa: number; persona: string } => {
  if (!usuario.company_id || !usuario.id) {
    throw new BadRequestException('La sesión no trae empresa o persona.');
  }
  return { empresa: usuario.company_id, persona: usuario.id };
};
