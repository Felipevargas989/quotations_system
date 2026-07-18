// Traduce errores de la API (axios + validación de NestJS) a mensajes en
// español que le digan al usuario QUÉ arreglar, en vez de "Request failed
// with status code 400".

const FIELD_MESSAGES: [RegExp, string][] = [
  [/event_date/i, "Falta la fecha del evento (o no es válida)"],
  [/client_id/i, "Falta seleccionar el cliente"],
  [/people_count/i, "El número de personas debe ser al menos 1"],
  [/event_type/i, "Falta el tipo de evento"],
  [/quotation_status/i, "Falta el estado de la cotización"],
  [/discount/i, "El descuento no es válido"],
  [/total_amount|subtotal/i, "Los totales no son válidos"],
];

export const humanizeApiError = (
  error: unknown,
  fallback = "Revisa los campos obligatorios e intenta de nuevo.",
): string => {
  const resp = (error as { response?: { data?: { message?: unknown } } })
    ?.response;
  const raw = resp?.data?.message;
  const list = Array.isArray(raw) ? raw : raw ? [raw] : [];

  const human = list
    .map((m) => FIELD_MESSAGES.find(([re]) => re.test(String(m)))?.[1])
    .filter((x): x is string => Boolean(x));

  if (human.length) return [...new Set(human)].join(" · ");
  if (list.length) return String(list[0]);

  const msg = (error as Error)?.message || "";
  if (/network/i.test(msg)) {
    return "No hay conexión con el servidor. ¿Está corriendo la API?";
  }
  return fallback;
};
