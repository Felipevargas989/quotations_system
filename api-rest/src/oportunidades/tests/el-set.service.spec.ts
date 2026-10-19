import { BadRequestException, NotFoundException } from '@nestjs/common';
import type { PinoLogger } from 'nestjs-pino';
import { mockPinoLogger } from 'src/testing/mocks';
import type { AnalisisRepository } from '../analisis/analisis.repository';
import { archivoDelZip, nombresDelZip } from '../analisis/docx';
import type { OferenteRepository } from '../oferente/oferente.repository';
import { ElSetService } from '../postulacion/el-set.service';
import type { PostulacionRepository } from '../postulacion/postulacion.repository';
import { wordCon } from './zip-de-prueba';

// «Descargar para Mercado Público» (decisión 34): junta lo de «Mi
// postulación», el análisis y la carpeta, baja los archivos y arma el ZIP.

const ANEXOS = wordCon([
  'Formulario N°3 - Experiencia',
  'Municipalidad de Quillón | N° 4352-103-SE23 | 2023',
]);

function armar() {
  const repo = {
    oportunidad: jest.fn().mockResolvedValue({
      id: 40,
      codigo: '1532886-5-LE26',
      estado: 'en_preparacion',
      proceso: {
        nombre: 'Día del Funcionario',
        organismo: 'I MUNICIPALIDAD DE QUILLON',
        fecha_cierre: '2026-10-19T18:01:00.000Z',
      },
    }),
    archivosDelSet: jest.fn().mockResolvedValue([
      {
        id: 6,
        nombre: 'Formularios_Anexos.docx',
        ruta: 'c1/bases/6',
        bytes: 900,
        seccion: 'bases',
        origen: 'subido',
        viene_de: null,
        generacion_id: null,
        creado_en: '2026-10-18T12:00:00.000Z',
      },
      {
        id: 12,
        nombre: 'Formularios_Anexos - lleno.docx',
        ruta: 'c1/postulacion/12',
        bytes: ANEXOS.length,
        seccion: 'postulacion',
        origen: 'generado',
        viene_de: 6,
        generacion_id: 3,
        creado_en: '2026-10-19T12:00:00.000Z',
      },
    ]),
    trabajosDeLaIA: jest.fn().mockResolvedValue([]),
  };
  const analisis = {
    ultimo: jest.fn().mockResolvedValue({
      estado: 'listo',
      resultado: {
        formularios: [
          {
            nombre: 'Formulario N°1 - Identificación del oferente',
            archivo: 'Formularios_Anexos.docx',
            aplica: true,
            se_entrega_en: 'administrativa',
          },
          {
            nombre: 'Formulario N°3 - Experiencia',
            archivo: 'Formularios_Anexos.docx',
            aplica: true,
            se_entrega_en: 'tecnica',
          },
        ],
        requisitos: [{ que: 'Experiencia en eventos municipales' }],
      },
    }),
    descargar: jest.fn((ruta: string) =>
      Promise.resolve(
        ruta === 'c1/postulacion/12' ? ANEXOS : Buffer.from(`pdf ${ruta}`),
      ),
    ),
  };
  const oferente = {
    documentos: jest.fn().mockResolvedValue([
      {
        id: 5,
        tipo: 'respaldo_experiencia',
        nombre: 'OC 4352-103-SE23.pdf',
        ruta: 'c1/oferente/5',
        tipo_archivo: 'application/pdf',
        bytes: 3000,
        vence: null,
        datos: { numero: '4352-103-SE23', fuente: 'mercado_publico' },
        creado_en: '2026-10-19T10:00:00.000Z',
        quien: null,
      },
    ]),
  };
  const servicio = new ElSetService(
    repo as unknown as PostulacionRepository,
    analisis as unknown as AnalisisRepository,
    oferente as unknown as OferenteRepository,
    mockPinoLogger() as unknown as PinoLogger,
  );
  return { repo, analisis, oferente, servicio };
}

describe('ElSetService', () => {
  it('revisar: dice qué va, en qué carpeta del ZIP, y qué falta', async () => {
    const { servicio } = armar();
    const set = await servicio.revisar(1, 40);
    expect(set.piezas).toEqual([
      {
        nombre: 'Formularios_Anexos - lleno.docx',
        carpetas: ['1. Administrativa', '2. Técnica'],
        que_es: 'formulario',
        aviso: 'sin firma',
      },
      {
        nombre: 'OC 4352-103-SE23.pdf',
        carpetas: ['2. Técnica/Respaldos de experiencia'],
        que_es: 'respaldo',
        aviso: null,
      },
    ]);
    expect(set.faltan).toEqual([
      '«Formularios_Anexos - lleno.docx» va sin firma: usa «Firmar» si el formulario la pide.',
    ]);
    expect(set.bytes).toBe(ANEXOS.length * 2 + 3000);
  });

  it('zip: arma el ZIP con cada archivo en su carpeta, bajando cada uno una vez', async () => {
    const { servicio, analisis } = armar();
    const { nombre, datos } = await servicio.zip(1, 40);
    expect(nombre).toBe('Postulación 1532886-5-LE26.zip');
    expect(nombresDelZip(datos)).toEqual([
      '1. Administrativa/Formularios_Anexos - lleno.docx',
      '2. Técnica/Formularios_Anexos - lleno.docx',
      '2. Técnica/Respaldos de experiencia/OC 4352-103-SE23.pdf',
    ]);
    expect(
      archivoDelZip(
        datos,
        '2. Técnica/Respaldos de experiencia/OC 4352-103-SE23.pdf',
      )?.toString(),
    ).toBe('pdf c1/oferente/5');
    expect(analisis.descargar).toHaveBeenCalledTimes(2);
  });

  it('zip: si un archivo no baja, sigue con los demás y lo anota adentro', async () => {
    const { servicio, analisis } = armar();
    analisis.descargar.mockImplementation((ruta: string) =>
      ruta === 'c1/oferente/5'
        ? Promise.reject(new Error('Object not found'))
        : Promise.resolve(ANEXOS),
    );
    const { datos } = await servicio.zip(1, 40);
    const nombres = nombresDelZip(datos) ?? [];
    expect(nombres).toContain('No se pudo bajar.txt');
    expect(nombres.join(' ')).not.toContain('OC 4352');
  });

  it('sin el análisis de las bases listo, no hay set', async () => {
    const { servicio, analisis } = armar();
    analisis.ultimo.mockResolvedValue({ estado: 'procesando' });
    await expect(servicio.revisar(1, 40)).rejects.toThrow(
      new BadRequestException(
        'Las bases se están analizando: espera a que termine.',
      ),
    );
    analisis.ultimo.mockResolvedValue(null);
    await expect(servicio.zip(1, 40)).rejects.toThrow(
      'Primero analiza las bases: de ahí sale qué va en cada carpeta.',
    );
  });

  it('una oportunidad de otra empresa no existe', async () => {
    const { servicio, repo } = armar();
    repo.oportunidad.mockResolvedValue(null);
    await expect(servicio.zip(2, 40)).rejects.toBeInstanceOf(NotFoundException);
  });
});
