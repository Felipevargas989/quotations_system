import { validateEnv } from './validate-env';

// Fase 2 Bloque B: la validación de configuración del Bloque A tiene
// que estar vigilada por pruebas — es la pieza que evita otro "falló
// en silencio 5 días".
describe('validateEnv', () => {
  const respaldo = { ...process.env };

  const completo = () => {
    process.env.SUPABASE_URL = 'https://x.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'clave';
    process.env.PORT = '3000';
    process.env.FRONTEND_URL = 'https://x.cl';
    process.env.RESEND_API_KEY = 're_x';
    process.env.SUPABASE_PASSWORD_RECOVERY_REDIRECT_URL = 'https://x.cl/r';
    process.env.SUPER_ADMIN_EMAILS = 'a@x.cl';
  };

  afterEach(() => {
    process.env = { ...respaldo };
  });

  it('sin una variable crítica, el servidor no debe partir (lanza)', () => {
    completo();
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(() => validateEnv()).toThrow(/SUPABASE_SERVICE_ROLE_KEY/);
  });

  it('una crítica en blanco cuenta como faltante', () => {
    completo();
    process.env.PORT = '   ';
    expect(() => validateEnv()).toThrow(/PORT/);
  });

  it('con todo presente no lanza y no advierte nada', () => {
    completo();
    expect(validateEnv()).toEqual([]);
  });

  it('una importante ausente se reporta para advertir, sin detener', () => {
    completo();
    delete process.env.RESEND_API_KEY;
    expect(validateEnv()).toEqual(['RESEND_API_KEY']);
  });
});
