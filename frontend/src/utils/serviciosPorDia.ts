// SERVICIOS ORDENADOS POR DÍA (20-11-2026, maqueta aprobada por Felipe).
//
// Lo que comparten la pieza `BandasPorDia` (cotizador y Post-Venta →
// Servicios) y el reparto de un paquete por días: qué comida es una
// casilla, el rótulo de cada día y cómo se mueve o se inserta una casilla
// sin salirse de su día. Todo puro: no cambia el formato guardado, cada
// casilla sigue guardando solo su `day`.

// La fecha del evento llega como texto «2026-11-22» (o con la hora
// detrás); el tipo dice Date en algunas pantallas. Medianoche UTC siempre.
export type FechaDelEvento = string | Date | null | undefined;
const medianoche = (f: FechaDelEvento) => {
  const texto =
    f instanceof Date
      ? isNaN(f.getTime())
        ? ""
        : f.toISOString()
      : String(f || "");
  return new Date(`${texto.slice(0, 10)}T00:00:00Z`);
};

export type Comida = "desayuno" | "almuerzo" | "cena" | "alojamiento";
// «ambigua»: la categoría trae dos comidas («Almuerzos & Cenas» de Valle
// del Sol). «extra»: otra cosa (cóctel, fiesta, decoración…).
export type TipoDeCaja = Comida | "ambigua" | "extra";

const limpio = (s: string | null | undefined) =>
  (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

const tiene = (texto: string, palabra: string) =>
  new RegExp(`(^|[^a-z])${palabra}(e?s)?([^a-z]|$)`).test(texto);

// Lo que dice UN texto: una comida, «ambigua» si nombra almuerzo y cena,
// o null si no dice nada reconocible.
const leer = (s: string | null | undefined): TipoDeCaja | null => {
  const t = limpio(s);
  if (!t) return null;
  // «Desayunos & Onces» cuenta como desayuno: la once va con el desayuno.
  if (tiene(t, "desayuno") || tiene(t, "once")) return "desayuno";
  const alm = tiene(t, "almuerzo");
  const cen = tiene(t, "cena");
  if (alm && cen) return "ambigua";
  if (alm) return "almuerzo";
  if (cen) return "cena";
  if (t.includes("alojamiento") || t.includes("ingreso")) return "alojamiento";
  return null;
};

// Qué comida es una casilla (Felipe, 20-11-2026). Primero el NOMBRE del
// menú guardado o de la casilla («Sernatur Almuerzo Día 3»); si no dice
// una comida clara, la CATEGORÍA («Sernatur - cena», «Desayunos & Onces»,
// «Servicios de Ingreso»). Si sigue ambigua («Almuerzos & Cenas»), queda
// «ambigua» y quien la usa decide (la banda llena el primer hueco; el
// reparto del paquete las turna).
export const tipoDeCaja = (
  nombre: string | null | undefined,
  categoria: string | null | undefined,
): TipoDeCaja => {
  const porNombre = leer(nombre);
  if (porNombre && porNombre !== "ambigua") return porNombre;
  const porCategoria = leer(categoria);
  if (porCategoria) return porCategoria;
  if (porNombre) return porNombre;
  return "extra";
};

// Las comidas que tiene un día, para los chips de la banda. Las ambiguas
// llenan el primer hueco del día: primero Almuerzo, después Cena.
export const comidasDelDia = (
  tipos: TipoDeCaja[],
): { comidas: Set<Comida>; extra: boolean } => {
  const comidas = new Set<Comida>();
  let ambiguas = 0;
  let extra = false;
  for (const t of tipos) {
    if (t === "ambigua") ambiguas++;
    else if (t === "extra") extra = true;
    else comidas.add(t);
  }
  for (; ambiguas > 0; ambiguas--) {
    if (!comidas.has("almuerzo")) comidas.add("almuerzo");
    else if (!comidas.has("cena")) comidas.add("cena");
    else break;
  }
  return { comidas, extra };
};

// «Día 2 · lunes 23-11». La fecha del evento es medianoche UTC (ver
// utils/dates): se calcula en UTC, igual que `dayLabel`.
export const rotuloDeDia = (
  n: number,
  fechaInicio: FechaDelEvento,
): { titulo: string; fecha: string } => {
  const titulo = `Día ${n}`;
  const base = medianoche(fechaInicio);
  if (!Number.isFinite(base.getTime())) return { titulo, fecha: "" };
  const d = new Date(base.getTime() + (n - 1) * 86400000);
  const semana = d.toLocaleDateString("es-CL", {
    weekday: "long",
    timeZone: "UTC",
  });
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return { titulo, fecha: `${semana} ${dd}-${mm}` };
};

// Flechas ▲▼ dentro del día: la casilla salta por encima de las de otros
// días hasta la vecina de SU día. Sin vecina en esa dirección, nada cambia.
// Con un solo día todas son del mismo día: es el movimiento de siempre.
export const moverDentroDelDia = <T>(
  cajas: T[],
  indice: number,
  delta: number,
  diaDe: (c: T) => number,
): T[] => {
  const caja = cajas[indice];
  if (caja === undefined || delta === 0) return cajas;
  const dia = diaDe(caja);
  const paso = delta > 0 ? 1 : -1;
  let destino = indice + paso;
  while (
    destino >= 0 &&
    destino < cajas.length &&
    diaDe(cajas[destino]) !== dia
  )
    destino += paso;
  if (destino < 0 || destino >= cajas.length) return cajas;
  const nuevas = [...cajas];
  const [movida] = nuevas.splice(indice, 1);
  nuevas.splice(destino, 0, movida);
  return nuevas;
};

// «+ Agregar al Día N»: la casilla nueva entra después de la última de ese
// día (o de un día anterior, si el día está vacío; al principio si no hay).
export const insertarEnDia = <T>(
  cajas: T[],
  nueva: T,
  dia: number,
  diaDe: (c: T) => number,
): T[] => {
  let despuesDe = -1;
  cajas.forEach((c, i) => {
    if (diaDe(c) <= dia) despuesDe = i;
  });
  const nuevas = [...cajas];
  nuevas.splice(despuesDe + 1, 0, nueva);
  return nuevas;
};

// Días del evento según el rango (1..N; sin «hasta» o fechas raras = 1;
// tope 60: un «hasta» tipeado un año después no puede parir 366 chips).
// Era una copia en el cotizador y otra en Post-Venta → Servicios.
export const contarDiasDelEvento = (
  desde: FechaDelEvento,
  hasta: FechaDelEvento,
): number => {
  if (!desde || !hasta) return 1;
  const s = medianoche(desde).getTime();
  const e = medianoche(hasta).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return 1;
  return Math.min(60, Math.round((e - s) / 86400000) + 1);
};

// «Día 1 (03/08)», el rótulo del selector de día de cada casilla.
export const rotuloCortoDeDia = (
  n: number,
  fechaInicio: FechaDelEvento,
): string => {
  const base = medianoche(fechaInicio);
  if (!Number.isFinite(base.getTime())) return `Día ${n}`;
  const d = new Date(base.getTime() + (n - 1) * 86400000);
  return `Día ${n} (${d.toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "UTC",
  })})`;
};

// El número que se ve en cada casilla: corrido de banda en banda (Día 1
// primero), en el orden manual dentro de cada día. Con un día, i + 1.
export const numerarPorDia = <T>(
  cajas: T[],
  diaDe: (c: T) => number,
): number[] => {
  const orden = cajas
    .map((c, i) => ({ i, dia: diaDe(c) }))
    .sort((a, b) => a.dia - b.dia || a.i - b.i);
  const numeros: number[] = new Array(cajas.length);
  orden.forEach(({ i }, k) => (numeros[i] = k + 1));
  return numeros;
};

// El aviso de «cambié el día de esta casilla» para `BandasPorDia`: `vez`
// distingue dos avisos seguidos a la misma casilla.
export type Resaltar = { indice: number; vez: number };
export const resaltarA = (indice: number): Resaltar => ({
  indice,
  vez: Date.now(),
});
