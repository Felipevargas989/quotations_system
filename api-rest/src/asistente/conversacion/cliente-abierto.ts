import type { UserRole } from 'src/users/entities/user.entity';
import type { AsistenteRepository } from '../asistente.repository';
import { fichaDeCliente } from '../herramientas/buscar-clientes';
import { esRecepcion, sinMontos } from '../herramientas/recepcion';

// LA FICHA DEL CLIENTE ABIERTO (doc 20 §17, mejora 2; Felipe, 04-11-2026:
// «vamos con todas»).
//
// BelIA sabía qué cotización tenía abierta la persona, pero en la ficha de
// un cliente solo le llegaba la ruta y lo tenía que buscar: una pregunta ahí
// tardó 22 s y 6 búsquedas. Ahora el motor lee el cliente de la base, con la
// empresa de la sesión, y se lo da antes de la pregunta, como las fichas al
// día (`lo-leido.ts`): la misma ficha de `buscar_clientes`, con más
// cotizaciones.

/** Cuántas cotizaciones del cliente abierto viajan, las más nuevas. */
export const ULTIMAS_DEL_CLIENTE_ABIERTO = 10;

export type ClienteAbierto = {
  /** Cómo se nombra la pantalla en las instrucciones del momento. */
  texto: string;
  /** La ficha, para poner antes de la pregunta. */
  bloque: string;
};

/** La ficha del cliente que la persona tiene abierto, o null si el cliente
 *  no es de la empresa de la sesión. */
export async function clienteAbierto(
  repositorio: Pick<
    AsistenteRepository,
    'clienteDeLaEmpresa' | 'cotizacionesDeClientes'
  >,
  empresa: number,
  id: string,
  rol: UserRole,
): Promise<ClienteAbierto | null> {
  const c = await repositorio.clienteDeLaEmpresa(empresa, id);
  if (!c) return null;
  const cotizaciones = await repositorio.cotizacionesDeClientes(empresa, [
    c.id,
  ]);
  const json = JSON.stringify(
    fichaDeCliente(c, cotizaciones, rol, ULTIMAS_DEL_CLIENTE_ABIERTO),
  );
  return {
    texto: `la ficha del cliente ${c.name}`,
    bloque: `FICHA DEL CLIENTE QUE TIENE ABIERTO, recién leída de Eventia: úsala y no lo busques con buscar_clientes.\n${esRecepcion(rol) ? sinMontos(json) : json}`,
  };
}
