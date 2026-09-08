import type {
  Asignacion,
  NominaDetalle,
  PagoPersona,
} from "../../types/people.types";

/**
 * UNA LÍNEA = UNA TRANSFERENCIA. Consolidado por RUT (Felipe, 16-08):
 * si la misma persona quedó cargada dos veces con el mismo RUT, se
 * paga una sola vez; sin RUT va por ficha (juntar a dos desconocidos
 * sería peor). Vivía dentro de NominaTab; desde el 08-09 lo usa también
 * el Histórico de pagos, así que es pieza compartida: un solo criterio
 * para "quién cobra cuánto en esta nómina".
 */
export interface PorPersona {
  /** Las fichas que caen en este pago: normalmente una, dos si la
   *  persona quedó cargada dos veces con el mismo RUT. */
  personIds: number[];
  persona: Asignacion["people"];
  jornadas: Asignacion[];
  propinas: Asignacion[];
  totalJornada: number;
  totalPropina: number;
  pagos: PagoPersona[];
}

export const porPersonaDe = (nomina: NominaDetalle): PorPersona[] => {
  const m = new Map<string, PorPersona>();
  const de = (a: Asignacion): PorPersona => {
    const rut = (a.people?.rut ?? "").trim();
    const llave = rut ? `rut:${rut}` : `ficha:${String(a.person_id)}`;
    if (!m.has(llave)) {
      m.set(llave, {
        personIds: [],
        persona: a.people ?? null,
        jornadas: [],
        propinas: [],
        totalJornada: 0,
        totalPropina: 0,
        pagos: [],
      });
    }
    const fila = m.get(llave)!;
    // El backend jamás manda sillas vacías a una nómina; el filtro es
    // solo para que el tipo lo diga.
    if (a.person_id != null && !fila.personIds.includes(a.person_id)) {
      fila.personIds.push(a.person_id);
      const suyo = nomina.pagos.find((p) => p.person_id === a.person_id);
      if (suyo) fila.pagos.push(suyo);
    }
    return fila;
  };
  for (const a of nomina.jornadas) {
    const p = de(a);
    p.jornadas.push(a);
    p.totalJornada += Number(a.amount ?? 0);
  }
  for (const a of nomina.propinas) {
    const p = de(a);
    p.propinas.push(a);
    p.totalPropina += Number(a.tip_amount ?? 0);
  }
  return [...m.values()].sort((a, b) =>
    (a.persona?.name ?? "").localeCompare(b.persona?.name ?? ""),
  );
};
