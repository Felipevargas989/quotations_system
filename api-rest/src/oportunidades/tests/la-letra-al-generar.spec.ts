import { archivoDelZip } from '../analisis/docx';
import type { Plan } from '../generacion/plan';
import { trabajarEnElTaller } from '../generacion/taller';
import {
  CALIBRI,
  enCalibri,
  fila,
  formularioCon,
  sinLetra,
  tabla,
} from './formulario-en-calibri';
import { armar, WORD } from './generacion-de-prueba';

// LA LETRA DEL FORMULARIO EN LO QUE ENTREGA LA IA (decisión 82): lo que
// escribió sin letra queda con la de su fila antes de llegar a «Mi
// postulación». Aparte de generacion.service.spec.ts, que está en el tope
// de 800 líneas del portero.

jest.mock('../generacion/taller', () => ({
  ...jest.requireActual<object>('../generacion/taller'),
  trabajarEnElTaller: jest.fn(),
}));
const taller = trabajarEnElTaller as jest.Mock;
beforeEach(() => taller.mockReset());

const PLAN: Plan = {
  tipo: 'anexos',
  modelo: 'claude-sonnet-5-5',
  oportunidadId: 40,
  perfil: 'perfil-1',
  sistema: 'Llenas los anexos.',
  texto: 'Llena los anexos.',
  entradas: [{ enElTaller: 'anexo_6.docx', tipo: WORD, ruta: 'c1/anexo.docx' }],
  salidas: [
    {
      enElTaller: 'lleno_6.docx',
      nombre: 'Formulario N°5 - Oferta económica - lleno.docx',
      origen: 'generado',
      viene_de: 6,
    },
  ],
  esfuerzo: 'medium',
  maxTokens: 32_000,
};

it('el Word lleno se guarda con la letra de su fila, y la fila anota lo que pesa', async () => {
  const { adjuntos, servicio, ejecutar } = armar();
  ejecutar.mockRestore();
  taller.mockResolvedValue({
    archivos: [
      {
        nombre: 'lleno_6.docx',
        datos: formularioCon(
          tabla(fila(enCalibri('Almuerzo'), sinLetra('$12.101'))),
        ),
      },
    ],
    texto: 'Listo.',
    uso: { entrada: 0, salida: 0, cacheEscrita: 0, cacheLeida: 0 },
    motivo: 'end_turn',
  });

  await servicio.ejecutar(1, 9, PLAN);

  const [[, datos]] = adjuntos.subirArchivo.mock.calls as Array<
    [string, Buffer, string]
  >;
  expect(archivoDelZip(datos, 'word/document.xml')?.toString('utf8')).toContain(
    `<w:r><w:rPr>${CALIBRI}<w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">$12.101</w:t></w:r>`,
  );
  expect(adjuntos.guardar).toHaveBeenCalledWith(
    expect.objectContaining({ bytes: datos.length }),
  );
});
