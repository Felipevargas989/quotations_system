import type { PreguntaALaIA } from "../../services/preguntas.service";

// LO ACLARADO MANDA (decisión 68 del doc 17, 22-10): la misma regla del
// motor (api-rest/src/oportunidades/preguntas/lo-aclarado.ts), aparte del
// servicio para que la pantalla y sus pruebas la usen sin la API.

/** ¿Entra a la memoria de la licitación? Lo que confirmó el comprador
 *  siempre; si no, solo lo que dicen los documentos (seguridad alta). */
export const entraALaPostulacion = (
  p: Pick<PreguntaALaIA, "estado" | "seguridad" | "confirmado">,
): boolean =>
  p.estado === "listo" &&
  (Boolean(p.confirmado?.trim()) || p.seguridad === "alta");
