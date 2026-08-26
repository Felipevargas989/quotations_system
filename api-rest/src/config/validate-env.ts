// Fase 2 (Bloque A): validación de configuración AL ARRANCAR.
//
// La lección del canal de correos: RESEND_API_KEY faltó 5 días y el
// servidor partió igual, fallando después en silencio. Desde ahora:
//  - Sin las variables CRÍTICAS el servidor NO parte, y el error dice
//    exactamente qué falta (Railway lo muestra en el log del deploy).
//  - Las variables IMPORTANTES pero no vitales generan una advertencia
//    fuerte en el log, para verlas sin tener que sufrirlas.

const CRITICAS = ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PORT'];

const IMPORTANTES = [
  'FRONTEND_URL', // CORS del dominio configurable
  'RESEND_API_KEY', // sin ella, todos los correos fallan
  'SUPABASE_PASSWORD_RECOVERY_REDIRECT_URL', // recuperar contraseña
  'SUPER_ADMIN_EMAILS', // área de super-admin
  // Marketing (revisión 26-08): sin estas, el módulo degrada en silencio.
  'PUBLIC_API_URL', // enlaces de baja del ambiente correcto
  'RESEND_WEBHOOK_SECRET', // sin él, producción RECHAZA los webhooks
  'MARKETING_BAJA_SECRET', // firma de la baja independiente de la API key
];

export function validateEnv(): string[] {
  const faltanCriticas = CRITICAS.filter((v) => !process.env[v]?.trim());
  if (faltanCriticas.length > 0) {
    throw new Error(
      `CONFIGURACIÓN INCOMPLETA — el servidor no puede partir. ` +
        `Faltan variables críticas: ${faltanCriticas.join(', ')}. ` +
        `Se definen en Railway → servicio api-rest → Variables.`,
    );
  }
  // Las importantes no detienen el arranque: se devuelven para que
  // main.ts las registre como advertencia visible en el log.
  return IMPORTANTES.filter((v) => !process.env[v]?.trim());
}
