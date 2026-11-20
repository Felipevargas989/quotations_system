// AL CARGAR UN PAQUETE, CADA CASILLA CAE EN SU DÍA (Felipe, 20-11-2026).
//
// Hasta hoy `loadCollectionAsBoxes` armaba las cajas del paquete sin día y
// todo caía en el Día 1: un programa de cinco noches había que repartirlo
// a mano, casilla por casilla. La regla, con la cotización 711 de Joker
// (Sernatur, 6 días) como modelo:
//
//   · el almuerzo k y la cena k (en el orden del paquete) van al día k;
//   · con alojamiento en el paquete, el desayuno k va al día k+1 (se
//     desayuna al otro día de dormir); sin alojamiento, al día 1;
//   · un alojamiento SUELTO × N se parte en N casillas × 1, días 1..N;
//   · la «Fiesta despedida» va la última noche (día N = número de
//     alojamientos; sin alojamiento, el último día del evento);
//   · las ambiguas («Almuerzos & Cenas») se turnan: la 1ª almuerzo del
//     día 1, la 2ª cena del día 1, la 3ª almuerzo del día 2…;
//   · lo demás, al día 1.
//
// Todo se acota al largo del evento: con un día, todo queda en el día 1.
//
// DESDE QUÉ DÍA PARTE (Felipe, 20-11-2026): dos programas seguidos en la
// misma cotización (uno del 22 al 27-11 y otro del 29-11 al 04-12) no
// pueden caer los dos en el Día 1. Con `desdeDia` = N, todo el programa
// se corre N − 1 días (su día 1 pasa a ser el día N) y se acota igual al
// largo del evento.
//
// Función pura: no cambia el formato guardado, solo pone `day`.

import { tipoDeCaja } from "./serviciosPorDia";

export type CajaDePaquete = {
  id: string;
  selectedCategory: string;
  groupName?: string;
  services: { nombre: string; quantity: number }[];
  day?: number;
};

const dice = (s: string | null | undefined, palabra: string) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .includes(palabra);

// La fiesta se reconoce por su nombre, no por su categoría: en la 711 va
// en la categoría «Sernatur - cena» y no es la cena.
const esFiesta = (c: CajaDePaquete) =>
  dice(c.groupName, "fiesta") ||
  dice(c.selectedCategory, "fiesta") ||
  (c.services.length > 0 && c.services.every((s) => dice(s.nombre, "fiesta")));

const tipoDe = (c: CajaDePaquete) =>
  tipoDeCaja(c.groupName, c.selectedCategory);

// Un alojamiento suelto × N se parte en N casillas × 1, una por noche.
const partirAlojamiento = <T extends CajaDePaquete>(c: T): T[] => {
  if (c.groupName || esFiesta(c) || tipoDe(c) !== "alojamiento") return [c];
  const noches = Math.max(
    1,
    ...c.services.map((s) => Math.round(Number(s.quantity) || 0)),
  );
  if (noches <= 1) return [c];
  return Array.from({ length: noches }, (_, k) => ({
    ...c,
    id: `${c.id}-noche${k + 1}`,
    services: c.services
      .filter((s) => Math.max(1, Math.round(Number(s.quantity) || 0)) > k)
      .map((s) => ({ ...s, quantity: 1 })),
  }));
};

export const repartirPaquetePorDia = <T extends CajaDePaquete>(
  cajas: T[],
  diasDelEvento: number,
  desdeDia = 1,
): T[] => {
  const partidas = cajas.flatMap(partirAlojamiento);
  const noches = partidas.filter(
    (c) => !esFiesta(c) && tipoDe(c) === "alojamiento",
  ).length;
  const tope = Math.max(1, Math.floor(diasDelEvento) || 1);
  const cuenta = { desayuno: 0, almuerzo: 0, cena: 0, alojamiento: 0 };
  let ambiguas = 0;
  const corrimiento = Math.max(0, Math.floor(desdeDia) - 1 || 0);

  return partidas.map((c) => {
    let dia = 1;
    const tipo = tipoDe(c);
    if (esFiesta(c)) dia = noches > 0 ? noches : tope;
    else if (tipo === "ambigua") dia = Math.floor(ambiguas++ / 2) + 1;
    else if (tipo === "desayuno") dia = noches > 0 ? ++cuenta.desayuno + 1 : 1;
    else if (tipo !== "extra") dia = ++cuenta[tipo];
    return { ...c, day: Math.max(1, Math.min(dia + corrimiento, tope)) };
  });
};
