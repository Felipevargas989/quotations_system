// Lo común de las solicitudes de recepción (doc 19 §9.45): las llaves de
// sus consultas y cómo se dicen el tipo, la plata y la hora.

/** Las del turno abierto (recepción). */
export const LLAVE_DEL_TURNO = ["solicitudes", "del-turno"];
/** La lista de quien aprueba. */
export const LLAVE_SOLICITUDES = ["solicitudes", "lista"];

export const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

export const nombreDelTipo = (tipo: number) =>
  tipo === 39 ? "Boleta" : "Factura";

export const horaDe = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
