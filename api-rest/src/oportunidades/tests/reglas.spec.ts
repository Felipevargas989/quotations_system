import {
  aplicarReglas,
  esDeComunaCercana,
  type Lectura,
} from '../lectura/reglas';

const COMUNAS = ['Quillón', 'Bulnes', 'Florida', 'San Ignacio', 'El Carmen'];

const lectura = (parcial: Partial<Lectura>): Lectura => ({
  semaforo: 'verde',
  etiquetas: ['evento'],
  se_hace_en_el_complejo: 'si',
  razon: 'prueba',
  ...parcial,
});

describe('esDeComunaCercana', () => {
  it('mira comuna, organismo y unidad, sin tildes', () => {
    expect(
      esDeComunaCercana({ organismo: 'I MUNICIPALIDAD DE QUILLON' }, COMUNAS),
    ).toBe(true);
    expect(esDeComunaCercana({ comuna: 'Quillón' }, COMUNAS)).toBe(true);
    expect(esDeComunaCercana({ unidad: 'DAEM San Ignacio' }, COMUNAS)).toBe(
      true,
    );
    expect(
      esDeComunaCercana({ organismo: 'Municipalidad de Chillán' }, COMUNAS),
    ).toBe(false);
  });

  it('palabra entera: una comuna no calza dentro de otra palabra', () => {
    expect(
      esDeComunaCercana({ organismo: 'Comercial Floridablanca' }, COMUNAS),
    ).toBe(false);
    expect(
      esDeComunaCercana({ organismo: 'Hospital de Florida' }, COMUNAS),
    ).toBe(true);
  });
});

describe('aplicarReglas', () => {
  const opciones = { comunasCercanas: COMUNAS, umbralAltoValor: 3_000_000 };

  it('comuna cercana y del rubro: nunca rojo, y avisa', () => {
    const r = aplicarReglas(
      lectura({ semaforo: 'rojo', etiquetas: ['alimentacion'] }),
      { organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON', monto: 400_000 },
      opciones,
    );
    expect(r.semaforo).toBe('amarillo');
    expect(r.alertas).toEqual(['comuna_cercana']);
  });

  it('comuna cercana pero NO del rubro (hormigón): sigue roja, sin aviso', () => {
    const r = aplicarReglas(
      lectura({ semaforo: 'rojo', etiquetas: ['otro'] }),
      { organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON', monto: 20_000_000 },
      opciones,
    );
    expect(r.semaforo).toBe('rojo');
    expect(r.alertas).toEqual([]);
  });

  it('monto igual o mayor al de alto valor: avisa (si no quedó en rojo)', () => {
    const r = aplicarReglas(
      lectura({ semaforo: 'verde' }),
      { organismo: 'Municipalidad de Hualqui', monto: 8_575_000 },
      opciones,
    );
    expect(r.alertas).toEqual(['alto_valor']);

    const roja = aplicarReglas(
      lectura({ semaforo: 'rojo', etiquetas: ['otro'] }),
      { organismo: 'Municipalidad de Hualqui', monto: 8_575_000 },
      opciones,
    );
    expect(roja.alertas).toEqual([]);
  });

  it('las dos alertas juntas: el Día del Profesor de Quillón', () => {
    const r = aplicarReglas(
      lectura({ semaforo: 'verde', etiquetas: ['evento', 'alimentacion'] }),
      {
        organismo: 'Ilustre Municipalidad de Quillon - Educación',
        monto: 15_960_000,
      },
      opciones,
    );
    expect(r.semaforo).toBe('verde');
    expect(r.alertas).toEqual(['comuna_cercana', 'alto_valor']);
  });

  it('sin umbral configurado, no hay alerta de monto', () => {
    const r = aplicarReglas(
      lectura({}),
      { organismo: 'Municipalidad de Hualqui', monto: 8_575_000 },
      { comunasCercanas: COMUNAS, umbralAltoValor: null },
    );
    expect(r.alertas).toEqual([]);
  });
});
