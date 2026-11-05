import { UserRole } from "../../constants/permissions";
import { UltimoCambio } from "../../services/permisos.service";

// Los textos de la pestaña «Permisos por cargo» (doc 22), aparte del
// componente para que la recarga en caliente siga funcionando.

export const NOMBRE_DEL_CARGO: Record<UserRole, string> = {
  recepcion: "Recepción",
  vendedor: "Vendedor",
  operaciones: "Operaciones",
  administrador: "Administrador",
};

const fechaDe = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", {
    dateStyle: "short",
    timeStyle: "short",
  });

export const textoDelUltimoCambio = (
  u: UltimoCambio | null,
  nombreDe: (clave: string) => string,
): string => {
  if (!u) return "Último cambio: ninguno, todo está de fábrica.";
  const quien = u.quien ?? "Alguien";
  const que =
    u.accion === "fabrica"
      ? "volvió todo a lo de fábrica"
      : `${u.prendido ? "prendió" : "apagó"} ${nombreDe(u.permiso ?? "")} a ${
          u.cargo ? NOMBRE_DEL_CARGO[u.cargo] : "un cargo"
        }`;
  return `Último cambio: ${quien} ${que}, ${fechaDe(u.cuando)}.`;
};
