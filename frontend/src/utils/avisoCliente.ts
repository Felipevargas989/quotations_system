// EL AVISO DE CLIENTE PARECIDO (Felipe, 16-10-2026: "sí, ármalo así").
//
// Al crear un cliente desde Recepción, el cotizador o Clientes, el motor
// revisa si ya existe uno parecido (api-rest/src/clients/coincidencias.ts)
// y, si lo hay, NO lo crea: responde 409 CLIENTE_PARECIDO con las
// coincidencias. Acá viven los textos del aviso, puros y probados.
// Las palabras las eligió Felipe: "usar este cliente (más que ficha),
// sumar como contacto a este cliente".

export type MotivoCoincidencia = "correo" | "telefono" | "nombre" | "dominio";

export interface CoincidenciaCliente {
  cliente_id: string;
  nombre: string;
  tipo: string | null;
  motivos: MotivoCoincidencia[];
  /** La persona del cliente cuyo correo o teléfono calzó. */
  persona: { id: number; nombre: string } | null;
  /** N° de la cotización más reciente del cliente. */
  cotizacion: number | null;
}

export const CLIENTE_PARECIDO = "CLIENTE_PARECIDO";

/** Las coincidencias que trae un 409 CLIENTE_PARECIDO, o null si es otro error. */
export const coincidenciasDe = (
  error: unknown,
): CoincidenciaCliente[] | null => {
  const resp = (
    error as {
      response?: {
        status?: number;
        data?: { codigo?: string; coincidencias?: CoincidenciaCliente[] };
      };
    }
  )?.response;
  if (resp?.status !== 409 || resp.data?.codigo !== CLIENTE_PARECIDO)
    return null;
  const lista = resp.data.coincidencias ?? [];
  return lista.length > 0 ? lista : null;
};

const porDato = (c: CoincidenciaCliente) =>
  c.motivos.includes("correo") || c.motivos.includes("telefono");

/** La primera línea del aviso, según qué calzó. */
export const tituloDelAviso = (lista: CoincidenciaCliente[]): string => {
  const m = new Set(lista.flatMap((c) => c.motivos));
  if (m.has("correo") && m.has("telefono"))
    return "Este correo y este teléfono ya están en Eventia";
  if (m.has("correo")) return "Este correo ya está en Eventia";
  if (m.has("telefono")) return "Este teléfono ya está en Eventia";
  if (m.has("nombre"))
    return lista.length > 1
      ? "Ya hay clientes con un nombre parecido"
      : "Ya hay un cliente con un nombre parecido";
  return "Ya tienes un cliente con ese correo de institución";
};

/** Qué cliente es y por qué se parece, en una frase. Sin el N° de
 *  cotización (Felipe, 16-10: "solo decir es July Díaz contacto del
 *  cliente CCU, ¿es el mismo cliente?"). */
export const detalleDeCoincidencia = (c: CoincidenciaCliente): string => {
  if (porDato(c) && c.persona)
    return `Es ${c.persona.nombre}, contacto del cliente «${c.nombre}». ¿Es el mismo cliente?`;
  if (porDato(c))
    return `Está en el cliente «${c.nombre}». ¿Es el mismo cliente?`;
  if (c.motivos.includes("nombre")) return `¿Es «${c.nombre}»?`;
  return `Ya tienes a «${c.nombre}», con ese mismo correo de institución. ¿Sumar a esta persona ahí?`;
};

type DatosRevisables = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  contact_email?: string | null;
  contact_phone?: string | null;
};

const correoCompleto = (v?: string | null) =>
  /^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test((v || "").trim());
const telefonoCompleto = (v?: string | null) =>
  (v || "").replace(/\D/g, "").length >= 8;
const nombreSuficiente = (v?: string | null) =>
  (v || "").replace(/[^\p{L}\p{N}]/gu, "").length >= 3;

/**
 * Lo que vale la pena revisar mientras se escribe (Felipe, 16-10: "mejor
 * cuando apenas termine de escribir"): solo datos completos, para no
 * preguntarle al motor por "judiaz@cc". Null si todavía no hay nada.
 */
export const datosParaRevisar = (
  d: DatosRevisables,
): Record<string, string> | null => {
  const r: Record<string, string> = {};
  if (nombreSuficiente(d.name)) r.name = (d.name || "").trim();
  if (correoCompleto(d.email)) r.email = (d.email || "").trim();
  if (correoCompleto(d.contact_email))
    r.contact_email = (d.contact_email || "").trim();
  if (telefonoCompleto(d.phone)) r.phone = (d.phone || "").trim();
  if (telefonoCompleto(d.contact_phone))
    r.contact_phone = (d.contact_phone || "").trim();
  return Object.keys(r).length > 0 ? r : null;
};

/** El título cuando hay varios para elegir (Felipe, 16-10: "¿cómo
 *  fusionamos el aviso?" → una lista y un solo juego de botones). */
export const tituloConLista = (lista: CoincidenciaCliente[]): string =>
  `${tituloDelAviso(lista)}. ¿Es uno de estos?`;

/** Por qué se parece, corto, para la fila de la lista. */
export const motivoCorto = (c: CoincidenciaCliente): string => {
  const correo = c.motivos.includes("correo");
  const fono = c.motivos.includes("telefono");
  const dato =
    correo && fono
      ? "mismo correo y teléfono"
      : correo
        ? "mismo correo"
        : fono
          ? "mismo teléfono"
          : "";
  const partes = [
    dato && c.persona ? `${c.persona.nombre} · ${dato}` : dato,
    c.motivos.includes("nombre") ? "nombre parecido" : "",
    c.motivos.includes("dominio") ? "mismo correo de institución" : "",
  ].filter(Boolean);
  return partes.join(" · ");
};

/** Particulares = UNA persona (regla de Felipe, 30-07): no se le suman contactos. */
export const admiteOtroContacto = (c: CoincidenciaCliente): boolean =>
  (c.tipo || "").trim().toLowerCase() !== "particulares";
