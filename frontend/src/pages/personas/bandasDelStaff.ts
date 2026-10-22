import type { Asignacion } from "../../types/people.types";

// LAS DOS BANDAS DE LA SÁBANA: LAS DECIDE EL TIPO DE CADA JORNADA
// (Felipe, 21-10-2026). "Si viene como freelance, ¿no debería quedar
// solamente en la parte de staff, así no mezclamos cosas? (…) si es
// staff (o freelance) queda siempre abajo; si es planta, queda en planta,
// y arriba en eventos ambos, dependiendo a quién citemos".
//
// Antes (15-08) la banda la decidía el CARGO: un cargo era de planta si
// alguien de planta tenía jornada ahí, y entonces TODA su fila iba arriba.
// Así Cecilia, freelance, quedó en "Personal de planta" porque Ana Luisa
// es de planta en Personal aseo. Ahora cada jornada sin evento va a la
// banda de su tipo, y un cargo con gente de los dos tipos sale en las dos.

export interface FilaSemana {
  /** null = el restaurante: el evento permanente. */
  quotationId: string | null;
  evento: string;
  cargoId: number;
  cargo: string;
  necesita: Map<string, number>;
  sinRepartir: number;
  /** Los días que dura el evento, dentro del rango visible. Sirven para
   *  MARCARLOS en la grilla —"no sale ninguna marca de cuándo es"
   *  (Felipe, 15-08)— y para poder poner gente ahí aunque el cupo haya
   *  quedado sin día. */
  diasDelEvento: ReadonlySet<string>;
  /** Solo sin evento: true = banda "Personal Staff" (freelance, la gente
   *  que se llama por día), false = banda "Personal de planta". */
  ocasional?: boolean;
}

interface CargoDelCatalogo {
  readonly id: number;
  readonly name: string;
  readonly type?: string | null;
  readonly is_active?: boolean | null;
}

/** Una jornada de planta va arriba; todo lo demás (freelance) va abajo. */
export const esDePlanta = (a: Pick<Asignacion, "kind">) => a.kind === "planta";

const cargosActivos = (catalogo: readonly CargoDelCatalogo[]) =>
  catalogo.filter((r) => r.type === "personal" && r.is_active !== false);

/** El cargo con el que una jornada se muestra: 0 = "Sin cargo" (el suyo
 *  ya no está activo), para que nadie quede invisible. */
const cargoVisible = (activos: ReadonlySet<number>, a: Asignacion) =>
  activos.has(a.role_id ?? 0) ? (a.role_id ?? 0) : 0;

/** Las filas sin evento de la sábana, planta primero y staff después,
 *  cada banda ordenada por cargo. */
export function filasSinEvento(
  catalogo: readonly CargoDelCatalogo[],
  sinEvento: readonly Asignacion[],
  /** Los cargos que se sumaron a Personal Staff con «+ cargo». */
  agregadosAMano: readonly number[],
): FilaSemana[] {
  const activos = cargosActivos(catalogo);
  const ids = new Set(activos.map((r) => r.id));
  const nombre = new Map(activos.map((r) => [r.id, r.name]));
  const dePlanta = new Set<number>();
  const deStaff = new Set<number>(agregadosAMano.filter((id) => ids.has(id)));
  for (const a of sinEvento)
    (esDePlanta(a) ? dePlanta : deStaff).add(cargoVisible(ids, a));

  const fila = (cargoId: number, ocasional: boolean): FilaSemana => ({
    quotationId: null,
    evento: "Staff",
    cargoId,
    cargo: cargoId === 0 ? "Sin cargo" : (nombre.get(cargoId) ?? "Sin cargo"),
    necesita: new Map(),
    sinRepartir: 0,
    diasDelEvento: new Set<string>(),
    ocasional,
  });
  const porCargo = (a: FilaSemana, b: FilaSemana) => a.cargo.localeCompare(b.cargo);
  const planta = [...dePlanta].map((id) => fila(id, false)).sort(porCargo);
  const staff = [...deStaff].map((id) => fila(id, true)).sort(porCargo);
  // La banda de Personal Staff existe SIEMPRE: es donde vive el
  // "+ cargo" (Felipe, 15-08). Sin esta fila vacía, cuando no hay
  // ningún staff no habría dónde agregar el primer cargo.
  if (staff.length === 0) staff.push({ ...fila(-1, true), cargo: "" });
  return [...planta, ...staff];
}

/** ¿Esta jornada va en esta fila? Una fila de evento es evento + cargo;
 *  una sin evento es cargo + banda. */
export function vaEnLaFila(
  a: Asignacion,
  fila: FilaSemana,
  catalogo: readonly CargoDelCatalogo[],
): boolean {
  if (String(a.quotation_id) !== String(fila.quotationId)) return false;
  if (fila.quotationId !== null) return (a.role_id ?? 0) === fila.cargoId;
  const ids = new Set(cargosActivos(catalogo).map((r) => r.id));
  return (
    cargoVisible(ids, a) === fila.cargoId &&
    esDePlanta(a) === !fila.ocasional
  );
}
