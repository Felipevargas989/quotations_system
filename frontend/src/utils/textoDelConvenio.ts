import type { MarcaDeConvenio } from "../types/clients.types";
import { fechaCl } from "./fechaCl";

/** El detalle del edificio de color en una línea (doc 24 §7). */
export const textoDelConvenio = (
  c: MarcaDeConvenio | null | undefined,
): string | null => {
  if (!c) return null;
  if (c.estado === "firmado") {
    return c.vence_at
      ? `Convenio firmado · vence ${fechaCl(c.vence_at)}`
      : "Convenio firmado";
  }
  return c.enviado_at
    ? `Convenio enviado · ${fechaCl(c.enviado_at)}`
    : "Convenio enviado";
};
