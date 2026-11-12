import {
  aplicarReglas,
  bajoElMinimo,
  esDeComunaCercana,
  esDelRubro,
  type Lectura,
  LEIDA_SEGUN_LA_LECTURA_CORTA,
  LEIDA_SEGUN_LAS_BASES,
  leidaSegunLasBases,
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

  it('comuna cercana y del rubro que la IA rechaza: queda en rojo con el aviso, es el reciclaje (decisión 72)', () => {
    // Felipe, 23-10, con las verduras de Portezuelo en la prioridad: "por
    // qué deja esto como amarillo si la IA reconoce que no es de mi
    // interés". Hasta ese día subía a amarillo.
    const r = aplicarReglas(
      lectura({
        semaforo: 'rojo',
        etiquetas: ['alimentacion'],
        se_hace_en_el_complejo: 'no',
      }),
      { organismo: 'I MUNICIPALIDAD DE PORTEZUELO', monto: 100_000 },
      { ...opciones, comunasCercanas: [...COMUNAS, 'Portezuelo'] },
    );
    expect(r.semaforo).toBe('rojo');
    expect(r.alertas).toEqual(['comuna_cercana']);
  });

  it('comuna cercana y del rubro que la IA aprueba: su color, y avisa', () => {
    const r = aplicarReglas(
      lectura({ semaforo: 'amarillo', etiquetas: ['alimentacion'] }),
      { organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON', monto: 400_000 },
      opciones,
    );
    expect(r.semaforo).toBe('amarillo');
    expect(r.alertas).toEqual(['comuna_cercana']);
  });

  it('comuna cercana pero NO del rubro (hormigón): sigue roja, sin aviso, es basura', () => {
    expect(esDelRubro(['otro'])).toBe(false);
    expect(esDelRubro(['paseo', 'otro'])).toBe(true);
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

describe('el monto mínimo de la empresa (decisión 129)', () => {
  // Felipe, 11-11: de sus descartes, 51 fueron «Muy chica», todas compras
  // ágiles con mediana de $370.000. Con un mínimo de $700.000: "ok".
  const conMinimo = {
    comunasCercanas: COMUNAS,
    umbralAltoValor: 3_000_000,
    montoMinimo: 700_000,
  };

  it('bajoElMinimo: solo con mínimo y con monto informado, y estrictamente menor', () => {
    expect(bajoElMinimo(370_000, 700_000)).toBe(true);
    expect(bajoElMinimo(700_000, 700_000)).toBe(false);
    expect(bajoElMinimo(2_200_000, 700_000)).toBe(false);
    expect(bajoElMinimo(null, 700_000)).toBe(false);
    expect(bajoElMinimo(0, 700_000)).toBe(false);
    expect(bajoElMinimo(370_000, null)).toBe(false);
    expect(bajoElMinimo(370_000, 0)).toBe(false);
    expect(bajoElMinimo(370_000, undefined)).toBe(false);
  });

  it('la verde o amarilla que pide menos queda en rojo, y la razón lo dice primero', () => {
    for (const color of ['verde', 'amarillo'] as const) {
      const r = aplicarReglas(
        lectura({
          semaforo: color,
          etiquetas: ['alimentacion'],
          razon: 'Coffee break en el complejo: del rubro.',
        }),
        { organismo: 'Municipalidad de Chillán', monto: 370_000 },
        conMinimo,
      );
      expect(r.semaforo).toBe('rojo');
      expect(r.razon).toBe(
        'Bajo tu mínimo de $700.000: pide $370.000. Coffee break en el complejo: del rubro.',
      );
      // Lo demás de la IA queda como lo leyó.
      expect(r.etiquetas).toEqual(['alimentacion']);
      expect(r.se_hace_en_el_complejo).toBe('si');
      expect(r.alertas).toEqual([]);
    }
  });

  it('la que ya era roja no cambia: ni el color ni la razón', () => {
    const r = aplicarReglas(
      lectura({ semaforo: 'rojo', etiquetas: ['otro'], razon: 'Insumos.' }),
      { organismo: 'Municipalidad de Chillán', monto: 100_000 },
      conMinimo,
    );
    expect(r.semaforo).toBe('rojo');
    expect(r.razon).toBe('Insumos.');
  });

  it('igual al mínimo, sobre el mínimo o sin monto informado: el color de la IA', () => {
    for (const monto of [700_000, 2_200_000, null]) {
      const r = aplicarReglas(
        lectura({ semaforo: 'verde', razon: 'Celebración.' }),
        { organismo: 'Municipalidad de Chillán', monto },
        conMinimo,
      );
      expect(r.semaforo).toBe('verde');
      expect(r.razon).toBe('Celebración.');
    }
  });

  it('sin mínimo configurado, nada cambia', () => {
    for (const montoMinimo of [null, 0, undefined]) {
      const r = aplicarReglas(
        lectura({ semaforo: 'amarillo' }),
        { organismo: 'Municipalidad de Chillán', monto: 150_000 },
        { comunasCercanas: COMUNAS, umbralAltoValor: null, montoMinimo },
      );
      expect(r.semaforo).toBe('amarillo');
      expect(r.razon).toBe('prueba');
    }
  });

  it('chica, de una comuna cercana y del rubro: roja con el aviso, es reciclaje (decisión 72)', () => {
    const r = aplicarReglas(
      lectura({ semaforo: 'verde', etiquetas: ['alimentacion'] }),
      { organismo: 'ILUSTRE MUNICIPALIDAD DE QUILLON', monto: 400_000 },
      conMinimo,
    );
    expect(r.semaforo).toBe('rojo');
    expect(r.alertas).toEqual(['comuna_cercana']);
    expect(
      r.razon.startsWith('Bajo tu mínimo de $700.000: pide $400.000.'),
    ).toBe(true);
  });
});

describe('leidaSegunLasBases (decisión 132)', () => {
  it('cuentan el análisis de Opus y la lectura corta; la lectura del radar no', () => {
    expect(leidaSegunLasBases(LEIDA_SEGUN_LAS_BASES)).toBe(true);
    expect(leidaSegunLasBases(LEIDA_SEGUN_LA_LECTURA_CORTA)).toBe(true);
    expect(leidaSegunLasBases('claude-haiku-5-5, reglas del 11-11')).toBe(
      false,
    );
    expect(leidaSegunLasBases(null)).toBe(false);
  });
});
