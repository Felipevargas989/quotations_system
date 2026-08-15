// LOS SERVICIOS QUE HAY QUE DAR EN UN DÍA
//
// Pedido de Felipe al pulir el resumen del día (15-08): "que muestre
// también los horarios de los servicios, cuánta gente hay que atender".
//
// Los servicios de una cotización viven en el JSONB `items`, y cada uno
// guarda el DÍA del evento al que pertenece (1, 2, 3…) y a cuánta gente
// atiende. La hora vive aparte, en event_service_times, con una clave
// por servicio.
//
// LA CLAVE ES LA MISMA QUE USA LA FICHA DE COCINA, y no puede cambiar:
// la primera aparición de una categoría guarda con su nombre tal cual y
// las siguientes llevan sufijo #2, #3. Si acá se calculara distinto, se
// mostrarían horas equivocadas — o ninguna.

export interface ServicioDelDia {
  /** "Almuerzo", "Coffee (2º)" — lo que se lee en pantalla. */
  readonly nombre: string;
  /** "HH:MM" o null si todavía no se le puso hora en la Ficha de Cocina. */
  readonly hora: string | null;
  /** A cuánta gente hay que atender en ese servicio. */
  readonly personas: number;
  /** "adultos" | "ninos" — solo cuando el evento tiene niños. */
  readonly audiencia: string | null;
}

interface ServicioVariable {
  category?: string;
  day?: number;
  people?: number;
  audience?: string;
}

/** Cuántos días dura el evento (sin término = un día). */
export const diasDelEvento = (
  inicio: string,
  termino: string | null,
): number => {
  if (!termino || termino <= inicio) return 1;
  const ms =
    new Date(`${termino}T00:00:00Z`).getTime() -
    new Date(`${inicio}T00:00:00Z`).getTime();
  return Math.max(1, Math.round(ms / 86_400_000) + 1);
};

/** Qué número de día del evento es esa fecha (1 = el primero). */
export const numeroDeDia = (inicio: string, dia: string): number => {
  const ms =
    new Date(`${dia}T00:00:00Z`).getTime() -
    new Date(`${inicio}T00:00:00Z`).getTime();
  return Math.round(ms / 86_400_000) + 1;
};

/**
 * Los servicios de UN día del evento, ordenados por hora (los que
 * todavía no tienen hora quedan al final).
 *
 * @param items      el JSONB `items` de la cotización
 * @param horas      el mapa { clave-de-servicio: "HH:MM" }
 * @param diaN       qué día del evento (1, 2, 3…)
 * @param totalDias  cuántos días dura el evento
 * @param personas   people_count del evento, por si un servicio no lo trae
 * @param tieneNinos si el evento tiene niños (decide mostrar la audiencia)
 */
export const serviciosDelDia = (
  items: unknown,
  horas: Record<string, string>,
  diaN: number,
  totalDias: number,
  personas: number,
  tieneNinos: boolean,
): ServicioDelDia[] => {
  const variables = ((items as { variable_services?: ServicioVariable[] })
    ?.variable_services ?? []) as ServicioVariable[];

  // Las claves, igual que la Ficha de Cocina: 1ª aparición con el nombre
  // tal cual, las siguientes con #2, #3…
  // OJO: la clave se arma sobre el valor CRUDO, igual que la Ficha de
  // Cocina — hay cotizaciones viejas con category null, y la Ficha
  // guarda esas horas bajo "null#2". Si acá se normalizara a
  // "Servicio", la hora existiría en la base y el resumen diría
  // "sin hora" para siempre.
  const cuantasVeces = new Map<string, number>();
  for (const g of variables) {
    const c = String(g.category);
    cuantasVeces.set(c, (cuantasVeces.get(c) ?? 0) + 1);
  }
  const vistas = new Map<string, number>();

  const salida: ServicioDelDia[] = [];
  for (const g of variables) {
    const categoria = String(g.category);
    const enPantalla = g.category ?? "Servicio";
    const n = (vistas.get(categoria) ?? 0) + 1;
    vistas.set(categoria, n);
    // El legado sin día se asume del primer día; nunca más allá del último.
    const suDia = Math.min(g.day || 1, totalDias);
    if (suDia !== diaN) continue;

    const clave = n === 1 ? categoria : `${categoria}#${String(n)}`;
    const repetida = (cuantasVeces.get(categoria) ?? 1) > 1;
    salida.push({
      nombre: repetida ? `${enPantalla} (${String(n)}º)` : enPantalla,
      hora: horas[clave]?.slice(0, 5) || null,
      personas: g.people ?? personas,
      audiencia: tieneNinos ? (g.audience ?? null) : null,
    });
  }

  return salida.sort((a, b) => {
    if (a.hora && b.hora) return a.hora.localeCompare(b.hora);
    if (a.hora) return -1;
    if (b.hora) return 1;
    return 0;
  });
};
