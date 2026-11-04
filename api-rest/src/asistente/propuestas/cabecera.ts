import { UserRole } from 'src/users/entities/user.entity';
import type { FotoGuardada, LineaDelCambio } from './editar-foto';

// LAS PERSONAS DEL EVENTO Y EL DESCUENTO, COMO PROPUESTA (doc 20, regla 5
// y §11, pregunta 1; Felipe, 04-11-2026).
//
// - Las personas: *"creo que debería poder en una cotización aún no
//   aceptada"*. Las aceptadas siguen por Post-Venta → Servicios, con las
//   compras y el plan de pagos a la vista.
// - El descuento: *"vamos con la 1 a la 6"*. El que la persona pida, nunca
//   uno que ofrezca BelIA, con el tope de su cargo: el mismo del cotizador
//   y de Post-Venta (`getMaxDiscountForRole`).
//
// La cuenta es la del cotizador, para que guardar la cotización después en
// la pantalla no la mueva ni un peso.

export type CambioDeCabecera = {
  /** Las personas del evento: el total y cuántas son niños. */
  personas?: { total: number; ninos?: number };
  /** Por porcentaje o por monto, como el interruptor %/$ del cotizador. */
  descuento?: { porcentaje?: number; monto?: number };
};

/** Lo que cambia de la cabecera, ya revisado, para la cuenta y el guardado. */
export type CabeceraNueva = {
  people_count?: number;
  children_count?: number;
  discount_percentage?: number;
  discount_amount?: number;
};

/** El tope de descuento de cada cargo, calco de `getMaxDiscountForRole`
 *  (QuotationForm y Post-Venta → Servicios). */
export const topeDeDescuento = (rol: UserRole): number =>
  rol === UserRole.ADMINISTRADOR
    ? 40
    : rol === UserRole.VENDEDOR || rol === UserRole.OPERACIONES
      ? 15
      : 0;

const n = (v: unknown): number => Number(v) || 0;

/** Las casillas como las deja el cotizador al cambiar las personas del
 *  evento (`loadExistingItemsFromJSON` y `boxPeople`): la que tenía el total
 *  de su audiencia lo sigue; la que tenía otro número, un ajuste a mano, lo
 *  conserva. Una casilla antigua sin personas ya sigue al total. */
export const conPersonasNuevas = (
  foto: FotoGuardada,
  antes: { adultos: number; ninos: number },
  despues: { adultos: number; ninos: number },
): { foto: FotoGuardada; lineas: LineaDelCambio[] } => {
  const lineas: LineaDelCambio[] = [];
  const casillas = (foto.variable_services ?? []).map((c) => {
    if (typeof c.people !== 'number') return c;
    const deNinos = c.audience === 'ninos';
    const era = deNinos ? antes.ninos : antes.adultos;
    const sera = deNinos ? despues.ninos : despues.adultos;
    if (c.people !== era || era === sera) return c;
    lineas.push({
      dia: Math.max(1, n(c.day) || 1),
      que: `${c.category ?? 'Casilla'} · ${deNinos ? 'niños' : 'adultos'}`,
      quita: [],
      agrega: [],
      personas: { antes: era, despues: sera },
    });
    return { ...c, people: sera };
  });
  return { foto: { ...foto, variable_services: casillas }, lineas };
};

/** Los fijos que cobran por persona. El cotizador no les rehace el precio
 *  al cambiar las personas, y BelIA tampoco (la cuenta tiene que cuadrar
 *  con la pantalla): se avisa. */
export const fijosPorPersona = (foto: FotoGuardada): string[] =>
  (foto.fixed_services ?? [])
    .filter(
      (f) =>
        (f.tipo_calculo === 'fijo_variable' ||
          f.tipo_calculo === 'variable_con_limites') &&
        n(f.precio_por_persona) > 0,
    )
    .map((f) => f.nombre || String(f.codigo ?? '?'));

/** «40 adultos y 10 niños», o «45 personas» si no hay niños. */
export const quienesSon = (total: number, ninos: number): string =>
  ninos > 0 ? `${total - ninos} adultos y ${ninos} niños` : `${total} personas`;
