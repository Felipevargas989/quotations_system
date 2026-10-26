import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import { archivoDelZip, textoDeDocx } from '../analisis/docx';
import type { GeneracionService } from '../generacion/generacion.service';
import type { OportunidadesRepository } from '../oportunidades.repository';
import { EditorDelWordService } from '../postulacion/editor-del-word.service';
import { leerElWord } from '../postulacion/el-word-editable';
import {
  CALIBRI,
  enCalibri,
  fila,
  formularioCon,
  tabla,
} from './formulario-en-calibri';
import { wordCon } from './zip-de-prueba';

// EL WORD SE EDITA EN EVENTIA (decisión 78): qué se puede editar, los
// candados (postulada, la IA trabajando, otra versión) y el archivo nuevo
// que reemplaza al de antes.

const RUTA =
  'c1/oportunidades/40/postulacion/2026-10-19T17-34-34-647Z_014c_Formulario_N_4.docx';
const WORD = wordCon(['FORMULARIO N°4', '[COMPLETAR: piscina]']);

const adjunto = (cambios: Record<string, unknown> = {}) => ({
  id: 13,
  nombre: 'Formulario N°4 - Calidad de la oferta - lleno.docx',
  ruta: RUTA,
  tipo: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  bytes: WORD.length,
  seccion: 'postulacion',
  origen: 'generado',
  ...cambios,
});

function armar({
  fila = adjunto() as Record<string, unknown> | null,
  estado = 'en_estudio',
  trabajando = false,
  cambia = true,
  word = WORD,
} = {}) {
  const adjuntos = {
    uno: jest.fn().mockResolvedValue(fila),
    bajarArchivo: jest.fn().mockResolvedValue(word),
    subirArchivo: jest.fn().mockResolvedValue(undefined),
    cambiarArchivo: jest.fn(
      (_c: number, _o: number, _a: number, _antes: string, nuevo: object) =>
        Promise.resolve(cambia ? { ...fila, ...nuevo } : null),
    ),
    borrarArchivo: jest.fn().mockResolvedValue(true),
  };
  const oportunidades = {
    ficha: jest.fn().mockResolvedValue({ id: 40, estado }),
  };
  const generacion = {
    ultimas: jest.fn().mockResolvedValue({
      anexos: { estado: trabajando ? 'procesando' : 'listo' },
      firma: null,
      propuesta: null,
    }),
  };
  const servicio = new EditorDelWordService(
    adjuntos as unknown as AdjuntosRepository,
    oportunidades as unknown as OportunidadesRepository,
    generacion as unknown as GeneracionService,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { adjuntos, servicio };
}

const version = leerElWord(WORD)?.version ?? '';
const cambio = { id: 1, tramos: [{ r: 0, t: '12 x 6 metros' }] };

describe('EditorDelWordService — abrir', () => {
  it('trae los párrafos del Word, sin el XML', async () => {
    const { servicio } = armar();
    const w = await servicio.abrir(1, 40, 13);
    expect(w.version).toBe(version);
    expect(w.bloques).toHaveLength(2);
    expect(w).not.toHaveProperty('xml');
  });

  it('solo los Word de «Mi postulación» sin firmar', async () => {
    for (const cambios of [
      { origen: 'firmado' },
      { seccion: 'bases' },
      { nombre: 'Formulario N°4.pdf' },
    ]) {
      const { servicio } = armar({ fila: adjunto(cambios) });
      await expect(servicio.abrir(1, 40, 13)).rejects.toThrow(
        BadRequestException,
      );
    }
    const { servicio } = armar({ fila: null });
    await expect(servicio.abrir(1, 40, 13)).rejects.toThrow(NotFoundException);
  });
});

describe('EditorDelWordService — guardar', () => {
  it('sube un Word nuevo con el cambio, pasa la fila a él y borra el de antes', async () => {
    const { adjuntos, servicio } = armar();
    await servicio.guardar(1, 40, 13, { version, parrafos: [cambio] });

    const [ruta, datos] = adjuntos.subirArchivo.mock.calls[0] as [
      string,
      Buffer,
    ];
    expect(ruta).toMatch(
      /^c1\/oportunidades\/40\/postulacion\/[\w-]+_Formulario_N_4_-_Calidad_de_la_oferta_-_lleno\.docx$/,
    );
    expect(textoDeDocx(datos)).toBe('FORMULARIO N°4\n12 x 6 metros');
    expect(adjuntos.cambiarArchivo).toHaveBeenCalledWith(1, 40, 13, RUTA, {
      ruta,
      bytes: datos.length,
    });
    expect(adjuntos.borrarArchivo).toHaveBeenCalledWith(RUTA);
  });

  it('lo escrito en una celda sin letra se guarda con la de su fila (decisión 82)', async () => {
    const word = formularioCon(
      tabla(fila(enCalibri('Almuerzo'), enCalibri('550'), '')),
    );
    const { adjuntos, servicio } = armar({ word });
    await servicio.guardar(1, 40, 13, {
      version: leerElWord(word)?.version ?? '',
      parrafos: [{ id: 2, tramos: [{ t: '$12.101' }] }],
    });

    const [, datos] = adjuntos.subirArchivo.mock.calls[0] as [string, Buffer];
    expect(
      archivoDelZip(datos, 'word/document.xml')?.toString('utf8'),
    ).toContain(
      `<w:r><w:rPr>${CALIBRI}<w:sz w:val="22"/></w:rPr><w:t xml:space="preserve">$12.101</w:t></w:r>`,
    );
  });

  it('sin párrafos cambiados no sube nada', async () => {
    const { adjuntos, servicio } = armar();
    await servicio.guardar(1, 40, 13, { version, parrafos: [] });
    expect(adjuntos.subirArchivo).not.toHaveBeenCalled();
  });

  it('con la licitación postulada no se toca', async () => {
    const { adjuntos, servicio } = armar({ estado: 'postulada' });
    await expect(
      servicio.guardar(1, 40, 13, { version, parrafos: [cambio] }),
    ).rejects.toThrow(BadRequestException);
    expect(adjuntos.subirArchivo).not.toHaveBeenCalled();
  });

  it('mientras la IA trabaja en los documentos, espera', async () => {
    const { adjuntos, servicio } = armar({ trabajando: true });
    await expect(
      servicio.guardar(1, 40, 13, { version, parrafos: [cambio] }),
    ).rejects.toThrow(ConflictException);
    expect(adjuntos.subirArchivo).not.toHaveBeenCalled();
  });

  it('si el Word cambió desde que se abrió, no se guarda encima', async () => {
    const { adjuntos, servicio } = armar();
    await expect(
      servicio.guardar(1, 40, 13, {
        version: 'f'.repeat(40),
        parrafos: [cambio],
      }),
    ).rejects.toThrow(ConflictException);
    expect(adjuntos.subirArchivo).not.toHaveBeenCalled();
  });

  it('un párrafo que no existe es 400', async () => {
    const { servicio } = armar();
    await expect(
      servicio.guardar(1, 40, 13, {
        version,
        parrafos: [{ id: 9, tramos: [{ t: 'x' }] }],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('si la fila cambió entremedio, borra el archivo nuevo y no toca el de antes', async () => {
    const { adjuntos, servicio } = armar({ cambia: false });
    await expect(
      servicio.guardar(1, 40, 13, { version, parrafos: [cambio] }),
    ).rejects.toThrow(ConflictException);
    const [nueva] = adjuntos.subirArchivo.mock.calls[0] as [string];
    expect(adjuntos.borrarArchivo).toHaveBeenCalledWith(nueva);
    expect(adjuntos.borrarArchivo).not.toHaveBeenCalledWith(RUTA);
  });
});
