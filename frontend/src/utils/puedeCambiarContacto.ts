import { SECTION_ROLES } from "../constants/permissions";
import { UserRole } from "../constants/users";
import { esEventoCongelado } from "./eventoCongelado";

/** ¿Quién puede cambiar el contacto? Las mismas reglas del cotizador: ventas
 *  mientras se vende; una aceptada, solo administrador y operaciones; un
 *  realizado está congelado y un anulado ya no se atiende. */
export const puedeCambiarContacto = (
  rol: string | null | undefined,
  estado: string | null | undefined,
): boolean => {
  if (!rol || !estado) return false;
  if (esEventoCongelado(estado) || estado === "cancelada") return false;
  if (estado === "aceptada")
    return rol === UserRole.ADMINISTRADOR || rol === UserRole.OPERACIONES;
  return SECTION_ROLES.quotations_edit.includes(rol as never);
};
