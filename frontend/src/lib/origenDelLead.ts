/**
 * ORIGEN DEL LEAD — la parte del navegador (12-09-2026).
 *
 * Cuando alguien pincha un anuncio, la plataforma le pega una huella a la
 * dirección (gclid de Google, fbclid de Meta) y, si la campaña venía
 * marcada, también las etiquetas utm_*. Además el navegador dice de qué
 * página venía. Todo eso vive SOLO en el momento de aterrizar: si la
 * persona navega o recarga, se pierde.
 *
 * Por eso se captura al entrar y se guarda mientras dura la visita.
 *
 * EL PRIMER TOQUE MANDA: si ya hay algo guardado, no se pisa. Quien llegó
 * por un anuncio, miró, y volvió después, sigue siendo mérito del anuncio.
 *
 * El motor es el que decide la etiqueta legible y qué se guarda de verdad
 * (api-rest/src/quotations/origen-del-lead.ts). Esto solo recolecta.
 */

const LLAVE = "eventia_origen_del_lead";

const PARAMETROS = [
  "gclid",
  "fbclid",
  "msclkid",
  "ttclid",
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
] as const;

export type OrigenDelLead = Record<string, string>;

/** sessionStorage puede no existir (modo privado, navegador con el
 *  almacenamiento bloqueado). Nunca puede tumbar el formulario. */
const leerGuardado = (): OrigenDelLead | undefined => {
  try {
    const crudo = sessionStorage.getItem(LLAVE);
    if (!crudo) return undefined;
    const valor = JSON.parse(crudo) as unknown;
    return valor && typeof valor === "object"
      ? (valor as OrigenDelLead)
      : undefined;
  } catch {
    return undefined;
  }
};

/**
 * Se llama al montar la página pública. Mira la dirección y el referente,
 * y guarda lo que encuentre. No pisa una captura anterior de esta visita.
 */
export const capturarOrigen = (): void => {
  try {
    if (leerGuardado()) return;

    const encontrado: OrigenDelLead = {};
    const params = new URLSearchParams(window.location.search);
    for (const nombre of PARAMETROS) {
      const valor = params.get(nombre)?.trim();
      if (valor) encontrado[nombre] = valor;
    }

    // El referente solo si viene de AFUERA: navegar dentro del propio
    // sitio no es un origen.
    const referente = document.referrer;
    if (referente) {
      try {
        if (new URL(referente).hostname !== window.location.hostname) {
          encontrado.referrer = referente;
        }
      } catch {
        /* referente ilegible: se ignora */
      }
    }

    if (Object.keys(encontrado).length) {
      sessionStorage.setItem(LLAVE, JSON.stringify(encontrado));
    }
  } catch {
    /* medir jamás puede romper el formulario */
  }
};

/** Lo capturado en esta visita, para enviarlo con la cotización. */
export const origenDelLead = (): OrigenDelLead | undefined => leerGuardado();
