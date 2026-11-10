// EL CAMBIO DE ESTADO QUEDA EN EL SEGUIMIENTO (Felipe, 09-11-2026):
// "cuando alguien mueva una cotización de estado, ¿se puede generar el
// registro en seguimiento? de quién la movió, de qué estado a cuál estado".
// Y después: "que no cuente como gestión en el semáforo, y que lo firme
// quien lo mueve". Mover una tarjeta no es hablar con el cliente: si
// contara, la dejaría en «Gestionada hoy» y escondería las olvidadas.
//
// Lo firma quien la movió (`registrarCambioDeEstado`). Si la movió Eventia
// sola, sin sesión (la licitación ganada que se acepta sola), firma BelIA.
// Es un registro: nadie lo edita ni lo borra.

/** El tipo de esas líneas. Nadie lo elige al anotar: el DTO solo acepta
 *  llamada, correo, reunión, WhatsApp y otro. */
export const TIPO_CAMBIO_DE_ESTADO = 'estado';

/** Lo que responde el motor si alguien intenta editar o borrar la línea. */
export const EL_CAMBIO_DE_ESTADO_NO_SE_EDITA =
  'El cambio de estado es un registro: no se edita ni se borra.';

// Las palabras de la pantalla (frontend/src/utils/estadoCotizacion.ts):
// 'cancelada' en la base, «Anulada» en pantalla (Felipe, 12-08).
const ETIQUETAS_DEL_ESTADO: Record<string, string> = {
  solicitada: 'Solicitada',
  enviada: 'Enviada',
  en_negociacion: 'En Negociación',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  realizada: 'Realizada',
  cancelada: 'Anulada',
};

// Los motivos de un rechazo o una anulación, con las palabras de la
// ventanita que los pide (frontend/src/components/MotivoPerdida.tsx).
const ETIQUETAS_DEL_MOTIVO: Record<string, string> = {
  precio: 'Precio',
  fecha_no_disponible: 'Fecha no disponible',
  otro_proveedor: 'Eligió otro proveedor',
  no_respondio: 'No respondió',
  desistio: 'Desistió del evento',
  cliente_cancelo: 'El cliente canceló',
  cambio_fecha: 'Se movió de fecha',
  problema_pago: 'Problema de pago',
  no_pudimos: 'No pudimos atenderlo',
  otro: 'Otro',
};

export const etiquetaDelEstado = (estado: string): string =>
  ETIQUETAS_DEL_ESTADO[estado] ?? estado;

/** «Cambió el estado de Enviada a Rechazada. Motivo: Precio.» */
export function notaDeCambioDeEstado(
  de: string,
  a: string,
  motivo?: string | null,
): string {
  const base = `Cambió el estado de ${etiquetaDelEstado(de)} a ${etiquetaDelEstado(a)}.`;
  const crudo = (motivo ?? '').trim();
  if (!crudo) return base;
  const etiqueta = (ETIQUETAS_DEL_MOTIVO[crudo] ?? crudo).replace(
    /[.\s]+$/u,
    '',
  );
  return `${base} Motivo: ${etiqueta}.`;
}

/** ¿Cuenta como gestión? Todo lo anotado, menos el cambio de estado. */
export const esGestion = (nota: { tipo?: string | null }): boolean =>
  nota.tipo !== TIPO_CAMBIO_DE_ESTADO;
