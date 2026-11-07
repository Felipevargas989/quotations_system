import type { DocumentoDeEmpresa } from '../oferente/oferente.repository';
import {
  type ArchivoDelSet,
  armarElSet,
  type DatosDelSet,
  enUnaSolaCarpeta,
  rutasEnElZip,
} from '../postulacion/el-set';

// UNA COMPRA ÁGIL LLEVA SOLO LO QUE PIDEN LAS BASES, EN UNA SOLA CARPETA
// (decisión 118 del doc 17, 07-11). Felipe, con la 2705-1740-COT26, que
// pedía solo la cotización detallada y llevaba siete documentos de «Mi
// empresa» en «4. Otros»: "1 zip 1 carpeta que se llame (Compra agil) solo
// lo que soliciten las bases y lo que la ley pida en compra agil nada más,
// ni patente, ni contratos de arriendo, nada adicional". La ley no pide
// adjuntar nada (arts. 97 y 98 del DS 661/2024). Aparte de `el-set.spec.ts`,
// que roza las 800 líneas del portero.

const archivo = (
  id: number,
  nombre: string,
  extra: Partial<ArchivoDelSet> = {},
): ArchivoDelSet => ({
  id,
  nombre,
  ruta: `c1/oportunidades/11072/x_${id}`,
  bytes: 1000,
  seccion: 'postulacion',
  origen: 'generado',
  viene_de: null,
  generacion_id: null,
  creado_en: '2026-11-07T11:20:00.000Z',
  ...extra,
});

const documento = (
  id: number,
  tipo: string,
  nombre: string,
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
});

const datos = (extra: Partial<DatosDelSet> = {}): DatosDelSet => ({
  archivos: [],
  formularios: [],
  requisitos: [],
  carpeta: [],
  inicioDe: new Map([[8, '2026-11-06T22:44:00.000Z']]),
  ofertaLista: '2026-11-06T22:43:00.000Z',
  corte: '2026-11-07',
  ...extra,
});

const pieza = (set: ReturnType<typeof armarElSet>, nombre: string) =>
  set.piezas.find((p) => p.nombre === nombre);

describe('el set de una compra ágil', () => {
  it('en una compra ágil va solo lo que piden las bases, sin «4. Otros» (decisión 118)', () => {
    // Como la 2705-1740-COT26: sin formularios, la sección 4 pide solo la
    // cotización detallada, y en «Mi empresa» están los generales y los
    // tres respaldos de la patente.
    const carpeta = [
      documento(51, 'erut', 'E-rut Quillon.pdf'),
      documento(52, 'no_quiebra', 'CERT_NUM_67406.pdf'),
      documento(53, 'patente', 'Patente 2 SEM 2026.pdf'),
      documento(54, 'vigencia', 'Certificado de vigencia octubre.pdf'),
      documento(55, 'respaldo_patente', 'Declaración de uso de patente.pdf'),
      documento(56, 'respaldo_patente', 'Comodato de arriendo.pdf'),
      documento(57, 'estatutos', 'Estatutos 2019.pdf'),
    ];
    const compra = (extra: Partial<DatosDelSet> = {}): DatosDelSet =>
      datos({
        archivos: [
          archivo(61, 'Propuesta técnica 2705-1740-COT26 - firmado.pdf', {
            origen: 'firmado',
            generacion_id: 8,
          }),
          archivo(62, 'Cotización detallada 2705-1740-COT26.pdf', {
            origen: 'subido',
          }),
        ],
        formularios: [],
        requisitos: [{ que: 'Cotización detallada con datos bancarios' }],
        documentos: [
          {
            nombre:
              'Cotización detallada (con plazo de entrega, detalle de lo ofertado y datos bancarios)',
            parte: 'economica',
            cuando: 'con_la_oferta',
            carpeta: 'otro',
            obligatorio: true,
          },
        ],
        carpeta,
        compraAgil: true,
        ...extra,
      });
    const set = armarElSet(compra());
    expect(set.piezas.map((p) => [p.nombre, p.carpetas])).toEqual([
      ['Propuesta técnica 2705-1740-COT26 - firmado.pdf', ['tecnica']],
      ['Cotización detallada 2705-1740-COT26.pdf', ['economica']],
    ]);
    expect(set.faltan.join(' ')).not.toContain('Para contratar');
    // Y en el ZIP, una sola carpeta: «Compra ágil».
    expect(rutasEnElZip(enUnaSolaCarpeta(set).piezas)).toEqual([
      ['Compra ágil/Propuesta técnica 2705-1740-COT26 - firmado.pdf'],
      ['Compra ágil/Cotización detallada 2705-1740-COT26.pdf'],
    ]);
    // Si piden la patente, va ella y, justo detrás, sus respaldos; los
    // demás generales siguen fuera.
    const conPatente = armarElSet(
      compra({
        documentos: [
          ...(compra().documentos ?? []),
          {
            nombre: 'Patente municipal vigente',
            parte: 'administrativa',
            cuando: 'con_la_oferta',
            carpeta: 'patente',
            obligatorio: true,
          },
        ],
      }),
    );
    expect(
      conPatente.piezas
        .filter((p) => p.que_es === 'documento')
        .map((p) => [p.nombre, p.carpetas]),
    ).toEqual([
      ['Patente 2 SEM 2026.pdf', ['administrativa']],
      ['Declaración de uso de patente.pdf', ['administrativa']],
      ['Comodato de arriendo.pdf', ['administrativa']],
    ]);
    expect(rutasEnElZip(enUnaSolaCarpeta(conPatente).piezas)).toEqual(
      expect.arrayContaining([
        ['Compra ágil/Patente 2 SEM 2026.pdf'],
        ['Compra ágil/Declaración de uso de patente.pdf'],
      ]),
    );
    // Lo subido a mano va siempre: lo decidió la empresa.
    const subido = armarElSet(
      compra({
        archivos: [
          ...compra().archivos,
          archivo(63, 'E-rut a mano.pdf', { origen: 'subido' }),
        ],
      }),
    );
    expect(pieza(subido, 'E-rut a mano.pdf')).toMatchObject({
      carpetas: ['otros'],
      que_es: 'subido',
    });
    // Un anexo que va en dos partes o un respaldo en su subcarpeta: en la
    // compra ágil, una vez y en la misma carpeta.
    const juntos = enUnaSolaCarpeta({
      piezas: [
        {
          nombre: 'Anexos - firmado.pdf',
          ruta: 'c1/x/1',
          bytes: 10,
          carpetas: ['administrativa', 'tecnica'],
          que_es: 'formulario',
          aviso: null,
        },
        {
          nombre: 'OC 4352-103-SE23.pdf',
          ruta: 'c1/x/2',
          bytes: 10,
          carpetas: ['tecnica'],
          subcarpeta: 'Respaldos de experiencia',
          que_es: 'respaldo',
          aviso: null,
        },
      ],
      faltan: [],
    });
    expect(rutasEnElZip(juntos.piezas)).toEqual([
      ['Compra ágil/Anexos - firmado.pdf'],
      ['Compra ágil/OC 4352-103-SE23.pdf'],
    ]);
    // Una licitación con lo mismo sigue con «4. Otros» (decisión 38).
    const licitacion = armarElSet(compra({ compraAgil: false }));
    expect(pieza(licitacion, 'E-rut Quillon.pdf')).toMatchObject({
      carpetas: ['otros'],
    });
    expect(
      pieza(licitacion, 'Declaración de uso de patente.pdf'),
    ).toMatchObject({ carpetas: ['otros'] });
  });
});
