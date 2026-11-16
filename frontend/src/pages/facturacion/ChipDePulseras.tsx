// El resultado del conteo de pulseras (doc 19 §9.49) en una palabra:
// «Calza» en verde, «Faltan N» en rojo, «Sobran N» en ámbar. Lo usan la
// pestaña «Pulseras» y el panel de un cierre de caja.

const chip = "whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold";

/** Diferencia = contadas − deberían quedar. */
const textoDePulseras = (diferencia: number) =>
  diferencia === 0
    ? "Calza"
    : diferencia < 0
      ? `Faltan ${-diferencia}`
      : `Sobran ${diferencia}`;

export default function ChipDePulseras({
  diferencia,
}: {
  readonly diferencia: number;
}) {
  const clase =
    diferencia === 0
      ? "bg-green-100 text-green-800"
      : diferencia < 0
        ? "bg-red-100 text-red-800"
        : "bg-amber-100 text-amber-800";
  return (
    <span className={`${chip} ${clase}`}>{textoDePulseras(diferencia)}</span>
  );
}
