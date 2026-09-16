import { newAccountTemplate } from '../templates/newAccount';

/**
 * LA BIENVENIDA ÚTIL (16-09-2026, paso 4). Antes era genérica: sin nombre
 * de empresa, sin la prueba de 7 días y con el botón apuntando a la
 * landing — a alguien que YA tiene cuenta. Estas pruebas fijan lo que
 * ahora tiene que decir, y que nunca lleve una contraseña.
 */
describe('el correo de bienvenida', () => {
  it('saluda con la empresa y dice hasta cuándo dura la prueba', () => {
    const html = newAccountTemplate({
      companyName: 'Banquetería La Prueba',
      pruebaVence: '2026-09-23T14:00:00.000Z',
    });
    expect(html).toContain('Banquetería La Prueba');
    expect(html).toContain('7 días de prueba gratis');
    expect(html).toContain('23 de septiembre');
  });

  it('el botón lleva a iniciar sesión, no a la landing', () => {
    const html = newAccountTemplate({ companyName: 'X' });
    expect(html).toContain('https://www.eventi-app.com/login');
    expect(html).toContain('Entrar a Eventia');
  });

  it('sin datos igual sale entera, sin "undefined" a la vista', () => {
    const html = newAccountTemplate();
    expect(html).toContain('Tu cuenta ya está creada');
    expect(html).not.toContain('undefined');
    expect(html).not.toContain('null');
  });

  it('un nombre con HTML llega desactivado: la puerta es pública', () => {
    const html = newAccountTemplate({
      companyName: '<script>alert(1)</script>',
    });
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
