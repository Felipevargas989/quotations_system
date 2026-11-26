import { BadRequestException } from '@nestjs/common';
import {
  rubroDeFabrica,
  rubroDeLaInstalacion,
} from 'src/oportunidades/rubro/rubro-de-la-instalacion';
import { esLicita, hayCotizador, instalacion } from '../instalacion';
import {
  CODIGO_NO_DISPONIBLE,
  exigirElCotizador,
  noDisponible,
} from '../no-disponible';

// LA VARIABLE DE LA INSTALACIÓN (paso 2 de Licita, 25-11): una sola,
// INSTALACION; sin ella, Eventia igual que siempre.

const antes = {
  INSTALACION: process.env.INSTALACION,
  OPORTUNIDADES_RUBRO: process.env.OPORTUNIDADES_RUBRO,
};
afterEach(() => {
  for (const [k, v] of Object.entries(antes)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe('instalacion()', () => {
  it('sin la variable, o con cualquier otra cosa, es eventia', () => {
    delete process.env.INSTALACION;
    expect(instalacion()).toBe('eventia');
    for (const otra of ['', 'eventia', 'licitá', 'fiscopio', 'produccion']) {
      expect(instalacion(otra)).toBe('eventia');
    }
    expect(esLicita()).toBe(false);
    expect(hayCotizador()).toBe(true);
  });

  it('licita solo si lo dice, sin importar mayúsculas ni espacios', () => {
    for (const v of ['licita', 'LICITA', '  Licita ']) {
      expect(instalacion(v)).toBe('licita');
    }
    process.env.INSTALACION = 'licita';
    expect(instalacion()).toBe('licita');
    expect(esLicita()).toBe(true);
    expect(hayCotizador()).toBe(false);
  });

  it('se lee en cada llamada, no al importar', () => {
    process.env.INSTALACION = 'licita';
    expect(esLicita()).toBe(true);
    delete process.env.INSTALACION;
    expect(esLicita()).toBe(false);
  });
});

describe('el rubro de Oportunidades sigue a la instalación', () => {
  it('en Eventia el de fábrica es eventos: nada cambia', () => {
    delete process.env.INSTALACION;
    delete process.env.OPORTUNIDADES_RUBRO;
    expect(rubroDeFabrica()).toBe('eventos');
    expect(rubroDeLaInstalacion()).toBe('eventos');
    expect(rubroDeLaInstalacion('cualquier-cosa')).toBe('eventos');
    process.env.OPORTUNIDADES_RUBRO = 'general';
    expect(rubroDeLaInstalacion()).toBe('general');
  });

  it('en Licita es general salvo que OPORTUNIDADES_RUBRO diga otra cosa', () => {
    process.env.INSTALACION = 'licita';
    delete process.env.OPORTUNIDADES_RUBRO;
    expect(rubroDeFabrica()).toBe('general');
    expect(rubroDeLaInstalacion()).toBe('general');
    expect(rubroDeLaInstalacion('cualquier-cosa')).toBe('general');
    process.env.OPORTUNIDADES_RUBRO = 'eventos';
    expect(rubroDeLaInstalacion()).toBe('eventos');
    process.env.OPORTUNIDADES_RUBRO = ' General ';
    expect(rubroDeLaInstalacion()).toBe('general');
  });
});

describe('«no disponible en esta instalación»', () => {
  it('en Eventia exigirElCotizador no hace nada', () => {
    delete process.env.INSTALACION;
    expect(() => exigirElCotizador('La cotización')).not.toThrow();
  });

  it('en Licita lanza un 400 con su código y el porqué en palabras', () => {
    process.env.INSTALACION = 'licita';
    let error: unknown;
    try {
      exigirElCotizador('La cotización de la postulación');
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(BadRequestException);
    const r = (error as BadRequestException).getResponse() as {
      codigo: string;
      message: string;
    };
    expect(r.codigo).toBe(CODIGO_NO_DISPONIBLE);
    expect(r.message).toContain('La cotización de la postulación');
    expect(r.message).toContain('no está disponible en esta instalación');
    expect(noDisponible('X').getStatus()).toBe(400);
  });
});
