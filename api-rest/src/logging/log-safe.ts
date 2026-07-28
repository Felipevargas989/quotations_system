// Fase 3 (28-07): registros SIN datos sensibles.
//
// El informe lo dijo y era verdad: los logs guardaban DTOs completos —
// incluidas CONTRASEÑAS (crear usuario, signup, crear empresa) y datos
// personales de clientes (nombre, correo, teléfono). Los registros
// viven 30+ días en Railway: todo lo que entra ahí es una copia más
// que proteger.
//
// logSafe reemplaza a JSON.stringify en los mensajes de log: conserva
// la forma del objeto (ids, montos, fechas, estados — lo útil para
// depurar) y tapa los campos sensibles. Ante la duda, un campo se tapa:
// la verbosidad se recupera fácil; una contraseña filtrada, no.
//
// La otra capa vive en app.module.ts: pino redacta los encabezados
// authorization/cookie de CADA petición (el token de sesión completo
// quedaba en el log de cada request).

const CAMPOS_SENSIBLES = new Set([
  'password',
  'admin_password',
  'email',
  'admin_email',
  'phone',
  'name',
  'full_name',
  'contact_name',
  'client_name',
  'observations',
  'notes',
  'address',
  'answers',
]);

export const logSafe = (valor: unknown): string =>
  JSON.stringify(valor, (clave, v) =>
    CAMPOS_SENSIBLES.has(clave) ? '[REDACTADO]' : (v as unknown),
  );
