// EL CANDADO DEL EVENTO REALIZADO, LADO PANTALLA (13-08-2026).
//
// La regla vive en el servidor (api-rest .../constants/constants.ts):
// un evento realizado ya se hizo y su cotización queda congelada como
// historia del negocio. Acá NO se repite la regla ni se decide nada;
// solo se refleja, para que nadie edite veinte minutos y se entere al
// guardar. El servidor sigue siendo la autoridad.
//
// Un solo lugar para las dos cosas que las pantallas necesitan saber:
// si el evento está congelado, y qué decirle a la persona.
export const esEventoCongelado = (estado?: string | null): boolean =>
  estado === "realizada";

export const AVISO_EVENTO_CONGELADO =
  "Este evento ya se realizó, así que quedó congelado como historia del " +
  "negocio: no se editan servicios, montos, propina, personas ni fecha. " +
  "La cobranza, el seguimiento y los documentos siguen abiertos. Si se " +
  'marcó realizado por equivocación, hay que devolverlo a "Aceptada".';
