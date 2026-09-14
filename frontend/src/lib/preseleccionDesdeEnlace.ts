// PRESELECCIÓN DESDE EL ENLACE (14-09-2026)
//
// Por qué existe: los anuncios de grupos no aterrizan en páginas nuevas,
// aterrizan directo en el cotizador (decisión de Felipe, 14-09). Para que
// la persona no tenga que buscar su tipo en la lista, el enlace del
// anuncio puede traerlo ya elegido:
//
//   /public-quotation/1?cliente=iglesias&evento=estadia
//
// Se compara sin tildes ni mayúsculas contra la lista VIVA de tipos de
// la empresa. Si no calza con nada, no pasa nada: el formulario abre
// como siempre. Nunca inventa un tipo que la empresa no tenga.

import { Dispatch, SetStateAction, useEffect } from "react";

const normalizar = (texto: string) =>
  texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export const preseleccionDesdeEnlace = (
  parametro: string,
  opciones: string[],
  busqueda?: string,
): string | undefined => {
  try {
    const crudo = new URLSearchParams(busqueda ?? window.location.search).get(
      parametro,
    );
    if (!crudo) return undefined;
    const pedido = normalizar(crudo);
    if (!pedido) return undefined;
    return (
      opciones.find((o) => normalizar(o) === pedido) ??
      opciones.find((o) => normalizar(o).startsWith(pedido))
    );
  } catch {
    return undefined;
  }
};

// El gancho que usa el formulario: se aplica cuando llegan las listas
// vivas (y antes, contra las de respaldo). Recibe el setFormData de
// useState, que es estable, para no correr en cada render.
export const usePreseleccionDesdeEnlace = <
  T extends { client_type?: string; event_type?: string },
>(
  clientes: string[],
  eventos: string[],
  setFormData: Dispatch<SetStateAction<T>>,
) => {
  useEffect(() => {
    const cliente = preseleccionDesdeEnlace("cliente", clientes);
    const evento = preseleccionDesdeEnlace("evento", eventos);
    if (!cliente && !evento) return;
    setFormData(
      (prev) =>
        ({
          ...prev,
          ...(cliente ? { client_type: cliente } : {}),
          ...(evento ? { event_type: evento } : {}),
        }) as T,
    );
  }, [clientes, eventos, setFormData]);
};
