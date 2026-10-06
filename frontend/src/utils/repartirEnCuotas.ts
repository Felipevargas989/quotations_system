/**
 * REPARTIR EN CUOTAS IGUALES (Felipe, 06-10-2026: "cuando agregue una
 * nueva cuota, que automáticamente se divida en dos ... y si se agrega
 * una tercera que se divida en tres, independiente que yo después la
 * pueda editar, pero que la propuesta inicial siempre sea fraccionada").
 *
 * Pesos enteros. Lo que no se puede dividir parejo (el resto de la
 * división) va a la PRIMERA cuota, que es el abono: así todas las demás
 * quedan iguales y la suma cuadra al peso con el total.
 *   repartirEnCuotas(1_000_001, 3) → [333_335, 333_333, 333_333]
 */
export function repartirEnCuotas(total: number, n: number): number[] {
  const entero = Math.round(total);
  if (n <= 0) return [];
  const base = Math.floor(entero / n);
  const resto = entero - base * n;
  return Array.from({ length: n }, (_, i) => (i === 0 ? base + resto : base));
}
