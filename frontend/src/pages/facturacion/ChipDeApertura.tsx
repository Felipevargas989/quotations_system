import type { AperturaComparada } from "../../services/caja.service";

// LA APERTURA CONTRA EL CIERRE ANTERIOR (doc 19 §9.53). Felipe, 16-11:
// *"debe concidier el saldo de cierre del ultimo cierre con la apertura
// siguiente, si no en el inter, se pierde el dinero"*. El chip en una
// palabra («Calza» verde, «Faltan» o «Sobran» rojo) y, si no calza, el monto
// en una línea chica debajo. Sin cierre anterior (el primer turno), nada.
// Solo lo ve quien revisa los cierres.

const clp = (n: number) =>
  `$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;
const chip =
  "inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold";

export default function ChipDeApertura({
  apertura,
}: {
  readonly apertura: AperturaComparada | null | undefined;
}) {
  if (!apertura) return null;
  const d = apertura.diferencia;
  const detalle =
    d === 0
      ? null
      : `${clp(d)} ${d < 0 ? "menos" : "más"} que el cierre anterior`;
  return (
    <span className="inline-flex max-w-full flex-col items-end">
      <span
        className={`${chip} ${d === 0 ? "border-green-200 bg-green-50 text-green-700" : "border-red-200 bg-red-50 text-red-700"}`}
      >
        {d === 0 ? "Calza" : d < 0 ? "Faltan" : "Sobran"}
      </span>
      {detalle && (
        <span
          title={detalle}
          className="mt-0.5 max-w-full truncate text-xs text-red-700"
        >
          {detalle}
        </span>
      )}
    </span>
  );
}
