import type { EstadoOportunidad } from "../../services/oportunidades.service";

// Los estados de una oportunidad, con su chip. Aparte de
// oportunidades.utils.ts, que está en el tope de 800 líneas del portero
// (19-10, al sumar «En seguimiento», decisión 30).

export const ESTADOS: ReadonlyArray<{
  readonly value: EstadoOportunidad;
  readonly label: string;
  readonly clases: string;
}> = [
  { value: "nueva", label: "Nueva", clases: "bg-blue-100 text-blue-800" },
  {
    value: "en_estudio",
    label: "En estudio",
    clases: "bg-amber-100 text-amber-800",
  },
  {
    value: "postulada",
    label: "Postulada",
    clases: "bg-purple-100 text-purple-800",
  },
  { value: "ganada", label: "Ganada", clases: "bg-green-100 text-green-800" },
  { value: "perdida", label: "Perdida", clases: "bg-gray-200 text-gray-700" },
  {
    value: "descartada",
    label: "Descartada",
    clases: "bg-gray-100 text-gray-500",
  },
  {
    value: "seguida",
    label: "En seguimiento",
    clases: "bg-sky-100 text-sky-800",
  },
];
