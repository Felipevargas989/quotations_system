// MEDICIÓN DE VALLE DEL SOL EN EL FORMULARIO PÚBLICO (11-09-2026)
//
// Por qué existe: las campañas de Google Ads de Valle del Sol llevan a
// este formulario, pero al pinchar el anuncio todavía no se sabe QUÉ
// quiere la persona. El tipo de evento recién existe cuando el cliente
// lo elige acá. Sin este aviso, una campaña de "paseo de curso" no se
// puede comprobar contra las cotizaciones de paseo de curso.
//
// Candado triple, a propósito:
//   1. solo la empresa 1 (Valle del Sol), no el resto de Eventia;
//   2. solo en el sitio real, nunca en el laboratorio ni en local;
//   3. solo en esta página, porque el contenedor se carga aquí.
//
// NO viajan datos personales: ni nombre, ni correo, ni teléfono.
// La propiedad de Eventia (analytics.ts) sigue igual y no se toca.

const CONTENEDOR_VALLE_DEL_SOL = "GTM-PJKJCW76";
const EMPRESA_VALLE_DEL_SOL = "1";

type VentanaConCapa = Window & { dataLayer?: Record<string, unknown>[] };

const corresponde = (companyId?: string) =>
  typeof window !== "undefined" &&
  companyId === EMPRESA_VALLE_DEL_SOL &&
  window.location.hostname.endsWith("eventi-app.com");

const capa = () => {
  const ventana = window as VentanaConCapa;
  ventana.dataLayer = ventana.dataLayer || [];
  return ventana.dataLayer;
};

// Carga el contenedor de Valle del Sol. Es el que lee el "pase" (_gl)
// que viene desde valledelsolquillon.cl y mantiene viva la campaña.
export const cargarMedicionValleDelSol = (companyId?: string) => {
  if (!corresponde(companyId)) return;
  if (document.getElementById("medicion-valle-del-sol")) return;

  capa().push({
    "gtm.start": new Date().getTime(),
    event: "gtm.js",
  });

  const etiqueta = document.createElement("script");
  etiqueta.id = "medicion-valle-del-sol";
  etiqueta.async = true;
  etiqueta.src = `https://www.googletagmanager.com/gtm.js?id=${CONTENEDOR_VALLE_DEL_SOL}`;
  document.head.appendChild(etiqueta);
};

// Se avisa SOLO cuando la solicitud se envió de verdad, nunca al
// elegir en la lista: elegir no es pedir.
export const avisarCotizacionEnviada = (
  companyId: string | undefined,
  tipoEvento: string,
  personas: number,
  conFecha: boolean,
) => {
  if (!corresponde(companyId)) return;

  capa().push({
    event: "cotizacion_enviada",
    tipo_evento: tipoEvento,
    personas,
    con_fecha: conFecha,
  });
};
