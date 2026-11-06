// RECEPCIÓN COTIZA A LOS PARTICULARES (doc 21, Felipe 04-11-2026: "debería
// poder crear, editar y enviar... el aceptar ya no... el plan de pago, eso
// es otra cosa").
//
// Lo que ve de las cotizaciones lo decide el motor (`AlcanceDeRecepcion`):
// los requerimientos de todos y las cotizaciones de clientes particulares.
// Acá solo se le esconden los estados que no da, para no ofrecerle una
// puerta que el motor cierra.

/** Aceptar es el plan de pagos; anular y realizado, de operaciones. */
export const ESTADOS_DE_OPERACIONES: readonly string[] = [
  "aceptada",
  "cancelada",
  "realizada",
];

export const esRecepcion = (rol: string | null | undefined): boolean =>
  rol === "recepcion";

/** Los estados que ofrece la píldora a este cargo: a recepción, sin los de
 *  operaciones; y una cotización que ya está en uno de ellos queda fija. */
export const estadosPara = (
  rol: string | null | undefined,
  estados: readonly string[],
  actual?: string | null,
): string[] => {
  if (!esRecepcion(rol)) return [...estados];
  if (actual && ESTADOS_DE_OPERACIONES.includes(actual)) return [actual];
  return estados.filter((e) => !ESTADOS_DE_OPERACIONES.includes(e));
};

const normal = (t: string | null | undefined): string =>
  (t ?? "").trim().toLowerCase();

/** Los tipos de cliente que trabaja el cargo, en minúsculas; null si los
 *  trabaja todos (doc 22 §9). Los dice el motor en el perfil
 *  (`useAuth().tiposDeCliente`); si todavía no los manda, lo de fábrica: a
 *  recepción, los tipos que su empresa marcó como particulares (doc 21); a
 *  los demás cargos, todos. */
export const tiposQueTrabaja = (
  rol: string | null | undefined,
  tiposDeLaEmpresa: readonly { name: string; es_particular?: boolean }[],
  delPerfil?: string[] | null,
): Set<string> | null => {
  const nombres =
    delPerfil !== undefined
      ? delPerfil
      : esRecepcion(rol)
        ? tiposDeLaEmpresa.filter((t) => t.es_particular).map((t) => t.name)
        : null;
  return nombres === null ? null : new Set(nombres.map(normal));
};

/** Los clientes que el cargo ve en el cotizador: los de los tipos que
 *  trabaja (`tiposQueTrabaja`), más el que ya está elegido, para no
 *  esconderlo. Si no trabaja ninguno, todos: al guardar, el motor responde
 *  igual. */
export const clientesParaElCotizador = <
  C extends { id: string; client_type?: string | null },
>(
  rol: string | null | undefined,
  clientes: C[],
  tipos: { name: string; es_particular?: boolean }[],
  elegido?: string | null,
  delPerfil?: string[] | null,
): C[] => {
  const trabaja = tiposQueTrabaja(rol, tipos, delPerfil);
  if (!trabaja || trabaja.size === 0) return clientes;
  return clientes.filter(
    (c) => c.id === elegido || trabaja.has(normal(c.client_type)),
  );
};
