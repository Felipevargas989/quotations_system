import { Building } from "lucide-react";
import type { MarcaDeConvenio } from "../../types/clients.types";
import { textoDelConvenio } from "../../utils/textoDelConvenio";

/**
 * EL EDIFICIO DE COLOR (doc 24 §7, Felipe 19-11-2026: «A, el edificio»).
 * Verde = convenio firmado; ámbar = enviado sin firmar (los tonos del chip
 * de la ficha). Al pasar el mouse, el detalle en una línea.
 * - «lista»: el edificio grande de Gestión de clientes; sin convenio queda
 *   gris, como siempre.
 * - «chico»: pegado al nombre (cotizador, negocio, Post-Venta); sin
 *   convenio no se dibuja nada.
 */
const COLOR = {
  firmado: "text-emerald-600",
  enviado: "text-amber-500",
} as const;

export default function EdificioConvenio({
  convenio,
  variante = "chico",
}: {
  readonly convenio?: MarcaDeConvenio | null;
  readonly variante?: "lista" | "chico";
}) {
  const texto = textoDelConvenio(convenio);
  if (variante === "chico") {
    if (!convenio || !texto) return null;
    return (
      <span
        title={texto}
        aria-label={texto}
        className="inline-flex align-middle shrink-0"
      >
        <Building className={`h-4 w-4 ${COLOR[convenio.estado]}`} />
      </span>
    );
  }
  return (
    <span
      title={texto ?? undefined}
      aria-label={texto ?? undefined}
      className="inline-flex shrink-0 mr-3"
    >
      <Building
        className={`h-8 w-8 ${convenio ? COLOR[convenio.estado] : "text-gray-400"}`}
      />
    </span>
  );
}
