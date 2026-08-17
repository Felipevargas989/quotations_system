import {
  digitoVerificador,
  formatearRut,
  limpiarRut,
  normalizarRut,
  revisarRut,
  rutEsValido,
} from '../utils/rut';

// LA REGLA DEL RUT, CON CANDADO.
//
// Los RUT de prueba NO son inventados: 7.093.990-8 es el de Avelina
// Pereira y 17.938.019-6 el de Camila Carvajal, los dos sacados de la
// hoja de proveedores del Excel "04 Nomina de Pagos".

describe('El dígito verificador', () => {
  it.each([
    ['7093990', '8'],
    ['17938019', '6'],
    ['15402881', '1'],
    ['19221045', '3'],
    ['19221047', 'K'],
  ])('de %s es %s', (numero, esperado) => {
    expect(digitoVerificador(numero)).toBe(esperado);
  });
});

describe('RUT que están bien', () => {
  it.each([
    '7093990-8',
    '7.093.990-8',
    '70939908',
    '17.938.019-6',
    '19221047-K',
    '19221047-k', // la k minúscula se acepta al escribir…
  ])('%s es válido', (valor) => {
    expect(rutEsValido(valor)).toBe(true);
  });

  it('…pero adentro siempre se guarda con K mayúscula y sin puntos', () => {
    expect(normalizarRut('19.221.047-k')).toBe('19221047-K');
    expect(normalizarRut('7.093.990-8')).toBe('7093990-8');
    expect(normalizarRut('70939908')).toBe('7093990-8');
  });
});

describe('RUT que están mal', () => {
  it('el dígito verificador equivocado no pasa', () => {
    // Este es real: Fernando Cortés Cortés aparece en la hoja de compras
    // como 10.071.580-9 y su dígito NO es 9. Se ve perfectamente normal
    // y el banco lo rechaza igual.
    expect(revisarRut('10071580-9')).toBe('digito');
    expect(revisarRut('7093990-1')).toBe('digito');
  });

  it('una cifra de más no pasa', () => {
    // También real: "77.7171.350-2" de Comercial Naranja, con un dígito
    // de más. Imposible que exista.
    expect(revisarRut('777171350-2')).toBe('forma');
  });

  it('vacío avisa que falta, no que está malo', () => {
    expect(revisarRut('')).toBe('vacio');
    expect(revisarRut('   ')).toBe('vacio');
  });

  it('muy corto no pasa', () => {
    expect(revisarRut('123-4')).toBe('forma');
  });
});

describe('Los RUT que pasan la matemática pero no son de nadie', () => {
  it('55.555.555-5 se rechaza — es el que el SII reserva para extranjeros sin RUT', () => {
    // Este es el peligroso: el cálculo da 5, así que cualquier revisión
    // superficial lo deja pasar.
    expect(digitoVerificador('55555555')).toBe('5');
    expect(revisarRut('55555555-5')).toBe('reservado');
  });

  it.each([
    '11111111-1',
    '22222222-2',
    '33333333-3',
    '44444444-4',
    '66666666-6',
    '77777777-7',
    '88888888-8',
    '99999999-9',
  ])('%s se rechaza aunque el cálculo dé bien', (valor) => {
    const [numero, dv] = valor.split('-');
    expect(digitoVerificador(numero)).toBe(dv); // el cálculo SÍ da
    expect(revisarRut(valor)).toBe('reservado'); // y aun así no pasa
  });
});

describe('Limpiar y mostrar', () => {
  it('limpiar bota puntos, guiones y espacios', () => {
    expect(limpiarRut(' 7.093.990-8 ')).toBe('70939908');
  });

  it('mostrar le pone los puntos de vuelta', () => {
    expect(formatearRut('7093990-8')).toBe('7.093.990-8');
    expect(formatearRut('17938019-6')).toBe('17.938.019-6');
  });

  it('lo que no es RUT se devuelve tal cual, sin romper la pantalla', () => {
    expect(formatearRut('no soy un rut')).toBe('no soy un rut');
  });
});
