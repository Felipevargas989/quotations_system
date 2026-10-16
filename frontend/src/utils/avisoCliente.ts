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

/** Qué cliente es y por qué se parece, en una frase. */
export const detalleDeCoincidencia = (c: CoincidenciaCliente): string => {
  const cot = c.cotizacion ? ` (cotización #${c.cotizacion})` : "";
  if (porDato(c) && c.persona)
    return `Es de ${c.persona.nombre}, contacto del cliente «${c.nombre}»${cot}. ¿Es el mismo cliente?`;
  if (porDato(c))
    return `Está en el cliente «${c.nombre}»${cot}. ¿Es el mismo cliente?`;
  if (c.motivos.includes("nombre")) return `¿Es «${c.nombre}»${cot}?`;
  return `Ya tienes a «${c.nombre}»${cot}, con ese mismo correo de institución. ¿Sumar a esta persona ahí?`;
};

/** Particulares = UNA persona (regla de Felipe, 30-07): no se le suman contactos. */
export const admiteOtroContacto = (c: CoincidenciaCliente): boolean =>
  (c.tipo || "").trim().toLowerCase() !== "particulares";
