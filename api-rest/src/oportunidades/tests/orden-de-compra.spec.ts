import {
  bajarOrdenDeCompra,
  CODIGO_DE_ORDEN,
  leerOrdenDeCompra,
} from '../oferente/orden-de-compra';
import { datosDeRespaldo, textoDelRespaldo } from '../oferente/respaldo';
import { FICHA_DE_LA_ORDEN, FICHA_VACIA } from './orden-de-compra-de-prueba';

// EL RESPALDO DE EXPERIENCIA (decisión 34 del doc 17, 19-10): con el número
// de una orden de compra, Eventia completa mandante, contrato, año y monto
// desde la ficha pública de Mercado Público.

describe('La ficha pública de una orden de compra', () => {
  it('se lee por los ids de sus campos', () => {
    expect(leerOrdenDeCompra(FICHA_DE_LA_ORDEN)).toEqual({
      numero: '4352-103-SE23',
      contrato:
        'CONTRATACION SERVICIO DE COCTELERIA Y CENA BAILABLE DIA DEL FUNCIONARIO',
      mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
      unidad: 'ADQUISICIONES Y FINANZAS',
      fecha: '2023-10-20',
      anio: 2023,
      monto: 11_782_499,
      estado: 'Aceptada',
      licitacion: '4352-18-LE23',
      rut_proveedor: '77.701.305-K',
    });
  });

  it('una orden que no existe trae los campos vacíos: null', () => {
    expect(leerOrdenDeCompra(FICHA_VACIA)).toBeNull();
  });

  it('solo se busca un número de orden de compra, nunca otra dirección', async () => {
    for (const bueno of [
      '4352-103-SE23',
      '1030177-163-AG23',
      '1346350-10-AG24',
    ]) {
      expect(CODIGO_DE_ORDEN.test(bueno)).toBe(true);
    }
    for (const malo of [
      '4352-103',
      '4352-103-SE23&x=1',
      'https://otro.cl/4352-103-SE23',
      '../4352-103-SE23',
    ]) {
      expect(CODIGO_DE_ORDEN.test(malo)).toBe(false);
    }
    const fetch = jest.spyOn(global, 'fetch');
    await expect(bajarOrdenDeCompra('../otra-cosa')).rejects.toThrow(
      'no es un número de orden de compra',
    );
    expect(fetch).not.toHaveBeenCalled();
    fetch.mockRestore();
  });
});

describe('Los datos de un respaldo de experiencia', () => {
  it('se limpian; el número es obligatorio', () => {
    expect(
      datosDeRespaldo(
        JSON.stringify({
          numero: ' 4352-103-SE23 ',
          mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
          contrato: 'Cena del Día del Funcionario',
          anio: '2023',
          monto: '$ 11.782.499',
          fuente: 'mercado_publico',
        }),
      ),
    ).toEqual({
      numero: '4352-103-SE23',
      mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
      contrato: 'Cena del Día del Funcionario',
      anio: 2023,
      monto: 11_782_499,
      fuente: 'mercado_publico',
    });
    expect(datosDeRespaldo(JSON.stringify({ mandante: 'CCU' }))).toEqual({
      problema: 'Falta el número de la orden de compra o la factura.',
    });
    expect(datosDeRespaldo(undefined)).toEqual({
      problema: 'Faltan los datos del respaldo (número, mandante...).',
    });
    expect(
      datosDeRespaldo(JSON.stringify({ numero: 'F-120', anio: 1500 })),
    ).toMatchObject({ numero: 'F-120', anio: null, fuente: 'manual' });
  });

  it('la IA lo lee en una línea', () => {
    expect(
      textoDelRespaldo({
        numero: '4352-103-SE23',
        mandante: 'ILUSTRE MUNICIPALIDAD DE QUILLON',
        contrato: 'Cena del Día del Funcionario',
        anio: 2023,
        monto: 11_782_499,
        fuente: 'mercado_publico',
      }),
    ).toBe(
      'N° 4352-103-SE23 · ILUSTRE MUNICIPALIDAD DE QUILLON · Cena del Día del Funcionario · 2023 · $11.782.499 con impuestos',
    );
  });
});
