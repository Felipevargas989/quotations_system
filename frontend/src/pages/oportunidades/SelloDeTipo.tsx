import type { TipoProceso } from "../../services/oportunidades.service";
import { TIPOS } from "./oportunidades.utils";
import { SELLO_DEL_TIPO } from "./tipoDeProceso";

// EL SELLO DE CADA TIPO (Felipe, 17-10: "sello compra ágil / sello
// licitación"). El mismo en la fila de la bandeja, el resumen al costado,
// «Mis licitaciones» y la ficha.

export default function SelloDeTipo({ tipo }: { readonly tipo: TipoProceso }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center px-2 py-0.5 text-xs font-semibold rounded ${SELLO_DEL_TIPO[tipo] ?? "bg-gray-100 text-gray-700"}`}
    >
      {TIPOS[tipo] ?? tipo}
    </span>
  );
}
