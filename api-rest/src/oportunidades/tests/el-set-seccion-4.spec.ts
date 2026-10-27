import type { DocumentoDeEmpresa } from '../oferente/oferente.repository';
import { armarElSet, type DatosDelSet } from '../postulacion/el-set';
import {
  type DocumentoDeLaSeccion4,
  fijaUnPlazo,
} from '../postulacion/la-seccion-4';

// EL ZIP LO ARMA LA SECCIÓN 4 Y LA VIGENCIA LA FIJAN LAS BASES (decisión 90
// del doc 17, 27-10). Felipe: "el zip se debe armar en función de lo que
// piden las bases... con el análisis de las bases en la sección 4, lo que
// tienes que presentar", y "si las bases te dicen que el certificado de
// vigencia no puede ser mayor a 30 días, ese es el criterio".

const documento = (
  id: number,
  tipo: string,
  nombre: string,
  extra: Partial<DocumentoDeEmpresa> = {},
): DocumentoDeEmpresa => ({
  id,
  tipo,
  nombre,
  ruta: `c1/oferente/documentos/${id}`,
  tipo_archivo: 'application/pdf',
  bytes: 2000,
  vence: null,
  datos: null,
  creado_en: '2026-10-01T12:00:00.000Z',
  quien: null,
  ...extra,
});

const pedido = (
  nombre: string,
  carpeta: string,
  extra: Partial<DocumentoDeLaSeccion4> = {},
): DocumentoDeLaSeccion4 => ({
  nombre,
  parte: 'administrativa',
  cuando: 'con_la_oferta',
  condicion: '',
  carpeta,
  ...extra,
});

const datos = (extra: Partial<DatosDelSet> = {}): DatosDelSet => ({
  archivos: [],
  formularios: [],
  requisitos: [],
  carpeta: [],
  inicioDe: new Map(),
  ofertaLista: null,
  corte: '2026-11-06',
  ...extra,
});

const deLaCarpeta = (set: ReturnType<typeof armarElSet>) =>
  set.piezas
    .filter((p) => p.que_es === 'documento')
    .map((p) => [p.nombre, p.carpetas, p.aviso]);

describe('el ZIP lo arma la sección 4 (decisión 90)', () => {
  it('va lo que la sección 4 pide con la oferta, en su parte; lo que se pide al adjudicar o al pagar, no', () => {
    const set = armarElSet(
      datos({
        documentos: [
          pedido('Certificado de vigencia de la sociedad', 'vigencia'),
          // El análisis lo dejó en «otro»: se reconoce por el nombre.
          pedido('Certificado de deuda de la Tesorería', 'otro', {
            parte: 'otra',
          }),
          pedido('Certificado F30', 'f30', { cuando: 'al_adjudicar' }),
          pedido('Informe DICOM', 'dicom', { cuando: 'al_pagar' }),
        ],
        carpeta: [
          documento(2, 'vigencia', 'Vigencia octubre.pdf'),
          documento(3, 'tgr', 'Deuda TGR.pdf'),
          documento(4, 'f30', 'F30 octubre.pdf'),
          documento(5, 'dicom', 'DICOM.pdf'),
        ],
      }),
    );
    expect(deLaCarpeta(set)).toEqual([
      ['Vigencia octubre.pdf', ['administrativa'], null],
      ['Deuda TGR.pdf', ['otros'], null],
    ]);
    expect(set.faltan).toEqual([]);
  });

  it('si las bases fijan un plazo desde la emisión, no manda la fecha que anotó la empresa; si solo dicen «vigente», sí', () => {
    const set = armarElSet(
      datos({
        documentos: [
          pedido('Certificado de vigencia', 'vigencia', {
            condicion: 'emitido hace no más de 30 días',
          }),
          pedido('Certificado F30', 'f30', { condicion: 'vigente' }),
        ],
        carpeta: [
          documento(2, 'vigencia', 'Vigencia agosto.pdf', {
            vence: '2026-10-01',
          }),
          documento(4, 'f30', 'F30 septiembre.pdf', { vence: '2026-10-31' }),
        ],
      }),
    );
    expect(deLaCarpeta(set)).toEqual([
      ['Vigencia agosto.pdf', ['administrativa'], null],
      ['F30 septiembre.pdf', ['administrativa'], 'vencido el 31-10-2026'],
    ]);
    expect(set.faltan).toEqual([
      '«Certificado F30» venció el 31-10-2026: súbelo renovado en «Mi empresa».',
    ]);
  });

  it('lo de UTP no va y el Registro de Proveedores tampoco; lo que no es obligatorio y falta no se avisa', () => {
    const set = armarElSet(
      datos({
        documentos: [
          // Así venía en la 5040-14-LE26.
          pedido('Instrumento de constitución de la UTP', 'estatutos', {
            obligatorio: false,
            condicion: 'Solo si postulas como UTP',
          }),
          pedido('Inscripción en el Registro de Proveedores', 'otro'),
          pedido(
            'Certificación de que el personal conoce el programa de integridad',
            'dj_trabajadores',
            { obligatorio: false },
          ),
        ],
        carpeta: [documento(8, 'estatutos', 'Estatutos 2019.pdf')],
      }),
    );
    // Los estatutos van como siempre a «4. Otros» (decisión 38), no a la
    // administrativa por lo de UTP.
    expect(deLaCarpeta(set)).toEqual([['Estatutos 2019.pdf', ['otros'], null]]);
    expect(set.faltan).toEqual([]);
  });

  it('lo que pide la sección 4 y no está en la carpeta se avisa', () => {
    const set = armarElSet(
      datos({
        documentos: [pedido('Resolución sanitaria', 'resolucion_sanitaria')],
      }),
    );
    expect(set.faltan).toEqual([
      'Las bases piden «Resolución sanitaria» y no está en tu carpeta: súbelo en «Mi empresa».',
    ]);
  });

  it('un análisis de antes, sin la sección 4, sigue con los nombres de los requisitos', () => {
    const set = armarElSet(
      datos({
        requisitos: [{ que: 'Certificado de antecedentes laborales (F30)' }],
        documentos: [{ nombre: 'Certificado F30' }],
        carpeta: [documento(4, 'f30', 'F30 septiembre.pdf')],
      }),
    );
    expect(deLaCarpeta(set)).toEqual([
      ['F30 septiembre.pdf', ['administrativa'], null],
    ]);
  });

  it('un plazo es en días o meses, con número o con palabras; «vigente» no lo es', () => {
    expect(fijaUnPlazo('emitido hace no más de 30 días')).toBe(true);
    expect(
      fijaUnPlazo(
        'con una antigüedad no superior a sesenta (60) días corridos',
      ),
    ).toBe(true);
    expect(fijaUnPlazo('emitido dentro de los últimos 3 meses')).toBe(true);
    expect(fijaUnPlazo('vigente')).toBe(false);
    expect(fijaUnPlazo('')).toBe(false);
    expect(fijaUnPlazo(undefined)).toBe(false);
  });
});
