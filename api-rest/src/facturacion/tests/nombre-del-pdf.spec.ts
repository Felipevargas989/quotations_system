import {
  nombreDelPdf,
  nombreDelPdfDe,
  nombreParaElBalde,
} from '../facturas/nombre-del-pdf';

/**
 * EL NOMBRE DEL PDF (doc 19 §9.35). Felipe, 08-11: «cuando descargo la
 * factura el nombre puede ser FXXXXX_ CLIENTE _ NRO COTIZACIÓN_OC SI TIENE».
 */
describe('El nombre del PDF (§9.35)', () => {
  it('la factura 383 de la Municipalidad: letra y folio, cliente, cotización y OC', () => {
    expect(
      nombreDelPdf({
        tipo: 33,
        folio: 383,
        cliente: 'Municipalidad de Quillón',
        cotizacion: 460,
        oc: '1213301-49-AG26',
      }),
    ).toBe('F383_Municipalidad de Quillón_460_1213301-49-AG26');
  });

  it('sin OC termina en la cotización; sin cotización, en el cliente', () => {
    expect(
      nombreDelPdf({
        tipo: 39,
        folio: 1022,
        cliente: 'Cabaña 4',
        cotizacion: 698,
        oc: null,
      }),
    ).toBe('B1022_Cabaña 4_698');
    expect(
      nombreDelPdf({
        tipo: 61,
        folio: 115,
        cliente: 'EVENTIA SPA',
        cotizacion: null,
        oc: null,
      }),
    ).toBe('NC115_EVENTIA SPA');
    expect(
      nombreDelPdf({
        tipo: 56,
        folio: 1,
        cliente: null,
        cotizacion: null,
        oc: null,
      }),
    ).toBe('ND1');
  });

  it('sin lo que un nombre de archivo no admite', () => {
    expect(
      nombreDelPdf({
        tipo: 33,
        folio: 7,
        cliente: 'Club A/B: "Los Pinos"',
        cotizacion: 1,
        oc: 'OC*12',
      }),
    ).toBe('F7_Club A B Los Pinos_1_OC 12');
  });

  it('en el balde, sin tildes ni espacios', () => {
    expect(
      nombreParaElBalde('F383_Municipalidad de Quillón_460_1213301-49-AG26'),
    ).toBe('F383_Municipalidad_de_Quillon_460_1213301-49-AG26');
  });

  it('el cliente de Eventia primero; si no, la razón social o la cabaña', () => {
    const base = { tipo: 33, folio: 382 };
    expect(
      nombreDelPdfDe({
        ...base,
        receptor: { razon_social: 'Comercial CCU S.A.' },
        cotizacion: { quotation_number: 554, cliente: { name: 'CCU' } },
        oc: { numero: '4505440173' },
      }),
    ).toBe('F382_CCU_554_4505440173');
    expect(
      nombreDelPdfDe({
        ...base,
        receptor: { razon_social: 'Comercial CCU S.A.' },
        cotizacion: null,
      }),
    ).toBe('F382_Comercial CCU S.A.');
    expect(
      nombreDelPdfDe({
        tipo: 39,
        folio: 9,
        receptor: null,
        detalle: [{ cabana: 'Cabaña 2' }],
      }),
    ).toBe('B9_Cabaña 2');
  });
});
