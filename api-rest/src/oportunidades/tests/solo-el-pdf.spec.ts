import type { PinoLogger } from 'nestjs-pino';
import type { AdjuntosRepository } from '../adjuntos/adjuntos.repository';
import type { Plan } from '../generacion/plan';
import { salidasDeLaFirma } from '../generacion/revision';
import { limpiarDespues, textosDeLoFirmado } from '../generacion/solo-el-pdf';
import { trabajarEnElTaller } from '../generacion/taller';
import { armar, WORD } from './generacion-de-prueba';
import { wordCon } from './zip-de-prueba';

// SE FIRMA Y SE BORRA (decisión 58, 20-10). Felipe: "si firmo el Word,
// bórralo... cada postulación se hace, se sube y muere, el documento es
// solo historia". Y "la información permanece, solo cambia el formato".

jest.mock('../generacion/taller', () => ({
  ...jest.requireActual<object>('../generacion/taller'),
  trabajarEnElTaller: jest.fn(),
}));
const taller = trabajarEnElTaller as jest.Mock;
beforeEach(() => taller.mockReset());

const par = (n: number) => ({
  firmado: { id: 100 + n, ruta: `r/${100 + n}.pdf` },
  word: { id: n, ruta: `r/${n}.docx`, viene_de: 54, generacion_id: 9 },
});

describe('Se firma y se borra', () => {
  it('el texto de cada Word queda por la ruta de su PDF; un Word que no se lee no se borra', async () => {
    const descargar = jest.fn((ruta: string) =>
      ruta === 'r/1.docx'
        ? Promise.resolve(wordCon(['ANEXO N°3', 'OC 5043-27-AG26']))
        : Promise.reject(new Error('no está')),
    );
    const { textos, pares } = await textosDeLoFirmado(
      [par(1), par(2)],
      descargar,
    );
    expect(pares).toEqual([par(1)]);
    expect(textos['r/101.pdf']).toContain('5043-27-AG26');
    expect(textos['r/102.pdf']).toBeUndefined();
  });

  it('después de guardar, se van los Word firmados y los borradores; si algo falla, solo se avisa', async () => {
    const adjuntos = {
      dejarSoloElPdf: jest.fn().mockRejectedValue(new Error('la base')),
      borrarBorradores: jest.fn().mockResolvedValue(2),
    };
    const logger = { warn: jest.fn() };
    await limpiarDespues(
      adjuntos as unknown as AdjuntosRepository,
      logger as unknown as PinoLogger,
      {
        companyId: 1,
        generacionId: 9,
        plan: { oportunidadId: 84, reemplaza: [63] } as Plan,
        pares: [par(1)],
      },
    );
    expect(adjuntos.dejarSoloElPdf).toHaveBeenCalledWith(1, 84, [par(1)]);
    expect(adjuntos.borrarBorradores).toHaveBeenCalledWith(1, 84, [63]);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining('no se borraron los Word firmados'),
    );
  });

  it('al terminar la firma: el texto del Word queda en el trabajo y el Word se va', async () => {
    const { adjuntos, repo, servicio, ejecutar } = armar();
    ejecutar.mockRestore();
    const antes = wordCon(['Firma: ____', 'Felipe Vargas'], 1);
    (repo.descargar as jest.Mock).mockResolvedValue(antes);
    adjuntos.paresFirmados.mockResolvedValue([par(12)]);
    taller.mockResolvedValue({
      archivos: [
        {
          nombre: 'firmado_12.docx',
          datos: wordCon(['Firma: ____', 'Felipe Vargas'], 2),
        },
        { nombre: 'firmado_12.pdf', datos: Buffer.from('%PDF-1.7 firmado') },
      ],
      texto: 'Firmé.',
      uso: { entrada: 1, salida: 1, cacheEscrita: 0, cacheLeida: 0 },
      motivo: 'end_turn',
    });
    const plan: Plan = {
      tipo: 'firma',
      modelo: 'claude-haiku-5-5',
      oportunidadId: 84,
      perfil: 'perfil-1',
      sistema: 'Firmas.',
      texto: 'Firma.',
      entradas: [
        { enElTaller: 'documento_12.docx', tipo: WORD, ruta: 'r/12.docx' },
      ],
      salidas: salidasDeLaFirma([
        {
          adjunto: { id: 12, nombre: 'Formulario N°1 - lleno.docx' },
          enElTaller: 'documento_12.docx',
        },
      ]),
      esfuerzo: 'medium',
      maxTokens: 8_000,
    };

    await servicio.ejecutar(1, 9, plan);

    expect(adjuntos.paresFirmados).toHaveBeenCalledWith(1, 84);
    expect(repo.terminar).toHaveBeenCalledWith(
      1,
      9,
      expect.objectContaining({
        estado: 'listo',
        resultado: expect.objectContaining({
          textos_de_lo_firmado: {
            'r/112.pdf': expect.stringContaining('Felipe Vargas') as unknown,
          },
        }) as unknown,
      }),
    );
    expect(adjuntos.dejarSoloElPdf).toHaveBeenCalledWith(1, 84, [par(12)]);
  });
});
