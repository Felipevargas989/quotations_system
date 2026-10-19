import {
  ESQUEMA_DE_BASES,
  instruccionesDeBases,
} from '../analisis/analisis.service';

// EL CHECKLIST DE DOCUMENTOS (19-10). Felipe: "me falta el checklist de los
// documentos... un certificado de DICOM sacado con dos semanas: en ninguna
// parte sale que tengo que tener ese documento". El análisis de las bases
// devuelve, aparte, solo los documentos: también los de adjudicar y pagar.

describe('El análisis pide el checklist de documentos', () => {
  it('con cuándo se entregan, dónde y a qué parte de la carpeta corresponden', () => {
    expect(ESQUEMA_DE_BASES.required).toContain('documentos');
    const documento = ESQUEMA_DE_BASES.properties.documentos.items;
    expect(documento.properties.cuando.enum).toEqual([
      'con_la_oferta',
      'al_adjudicar',
      'al_pagar',
    ]);
    expect(documento.properties.carpeta.enum).toEqual(
      expect.arrayContaining(['formulario', 'patente', 'dj_trabajadores']),
    );
  });

  it('solo documentos, también los de adjudicar y pagar (el DICOM, el F30)', () => {
    const texto = instruccionesDeBases({
      codigo: '4364-13-LE26',
      nombre: 'Día del Profesor',
      organismo: 'I. Municipalidad de Quillón',
      comuna: 'Quillón',
      perfil: null,
    });
    expect(texto).toContain('el checklist de TODOS los DOCUMENTOS');
    expect(texto).toContain('DICOM');
    expect(texto).toContain('Solo documentos');
  });
});
