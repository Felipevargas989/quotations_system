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

/** Los clientes que recepción ve en el cotizador: los de los tipos que su
 *  empresa marcó como particulares (doc 21), más el que ya está elegido,
 *  para no esconderlo. Los demás cargos, todos. Si la empresa no marcó
 *  ninguno, todos: al guardar, el motor responde igual. */
export const clientesParaElCotizador = <
  C extends { id: string; client_type?: string | null },
>(
  rol: string | null | undefined,
  clientes: C[],
  tipos: { name: string; es_particular?: boolean }[],
  elegido?: string | null,
): C[] => {
  if (!esRecepcion(rol)) return clientes;
  const particulares = new Set(
    tipos
      .filter((t) => t.es_particular)
      .map((t) => t.name.trim().toLowerCase()),
  );
  if (particulares.size === 0) return clientes;
  return clientes.filter(
    (c) =>
      c.id === elegido ||
      particulares.has((c.client_type ?? "").trim().toLowerCase()),
  );
};
