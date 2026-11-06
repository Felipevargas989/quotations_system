import { BadRequestException } from '@nestjs/common';
import { mockPinoLogger } from '../../testing/mocks';
import type {
  FacturacionCl,
  RespuestaDeProcesar,
} from '../facturacion-cl/facturacion-cl';
import { mandarConFolio } from '../facturas/emision';

/**
 * MANDAR UN DOCUMENTO CON FOLIO (doc 19 §9.10 y §9.18): cuándo se pide otro
 * folio una vez más. Lo del paso 0 (06-11, ambiente de prueba): con varios
 * rangos por tipo, facturacion.cl rechazó «fuera del rango que tiene
 * autorizado» la nota de débito con el siguiente de uno de ellos.
 */

const FUERA_DEL_RANGO =
  'ERROR: P0001: El folio que esta enviando se encuentra fuera del rango que tiene autorizado';

const respuesta = (
  r: Partial<RespuestaDeProcesar> & Pick<RespuestaDeProcesar, 'resultado'>,
): RespuestaDeProcesar => ({
  tipo: 56,
  folio: null,
  fecha: null,
  mensaje: r.resultado === 'emitido' ? 'Proceso exitoso.' : '',
  urlOriginal: null,
  urlCedible: null,
  crudo: { xml: '<WSPLANO/>' },
  ...r,
});

const armar = (opciones: {
  procesar: RespuestaDeProcesar[];
  /** Lo que responde `folioSiguiente` al pedir otro (o un error). */
  otro?: number | Error;
}) => {
  const procesar = jest.fn();
  opciones.procesar.forEach((r) => procesar.mockResolvedValueOnce(r));
  const folioSiguiente = jest.fn(
    (_tipo: number, descartados?: number[]): Promise<number> => {
      if (!descartados) return Promise.resolve(292104);
      return opciones.otro instanceof Error
        ? Promise.reject(opciones.otro)
        : Promise.resolve(opciones.otro ?? 292104);
    },
  );
  const conexion = {
    ambiente: 'prueba',
    folioSiguiente,
    procesar,
  } as unknown as FacturacionCl;
  const repo = {
    crear: jest.fn((fila: Record<string, unknown>) =>
      Promise.resolve({ id: 22, ...fila }),
    ),
    actualizar: jest.fn(
      (id: number, _companyId: number, cambios: Record<string, unknown>) =>
        Promise.resolve({ id, ...cambios }),
    ),
  };
  const mandar = () =>
    mandarConFolio({
      repo: repo as never,
      conexion,
      logger: mockPinoLogger() as never,
      user: { id: 'u-felipe', company_id: 1 } as never,
      tipo: 56,
      fila: { company_id: 1, tipo: 56, estado: 'enviando' } as never,
      armar: (folio) => `56;${folio};2026-11-06`,
      fecha: '2026-11-06',
      nombre: 'La nota de débito',
    });
  return { conexion, folioSiguiente, procesar, repo, mandar };
};

describe('mandarConFolio: otro folio una vez más', () => {
  it('«fuera del rango que tiene autorizado»: pide el folio de otro rango y sale con ese', async () => {
    const { folioSiguiente, procesar, repo, mandar } = armar({
      procesar: [
        respuesta({ resultado: 'rechazado', mensaje: FUERA_DEL_RANGO }),
        respuesta({ resultado: 'emitido', folio: 9999742766 }),
      ],
      otro: 9999742766,
    });

    const { documento, porConfirmar } = await mandar();

    expect(folioSiguiente).toHaveBeenLastCalledWith(56, [292104]);
    expect(procesar).toHaveBeenNthCalledWith(1, '56;292104;2026-11-06', 56);
    expect(procesar).toHaveBeenNthCalledWith(2, '56;9999742766;2026-11-06', 56);
    // El archivo que quedó anotado es el que salió.
    expect(repo.actualizar).toHaveBeenCalledWith(22, 1, {
      archivo_enviado: '56;9999742766;2026-11-06',
    });
    expect(porConfirmar).toBe(false);
    expect(documento).toMatchObject({ estado: 'emitido', folio: 9999742766 });
  });

  it('«fuera del rango» sin otro rango con folios: queda rechazado con lo que dijo, no «por confirmar»', async () => {
    const { procesar, repo, mandar } = armar({
      procesar: [
        respuesta({ resultado: 'rechazado', mensaje: FUERA_DEL_RANGO }),
      ],
      otro: new Error('facturacion.cl no tiene folios disponibles del tipo 56'),
    });

    await expect(mandar()).rejects.toThrow(
      new BadRequestException(
        `facturacion.cl no la aceptó: ${FUERA_DEL_RANGO}`,
      ),
    );
    expect(procesar).toHaveBeenCalledTimes(1);
    expect(repo.actualizar).toHaveBeenCalledWith(
      22,
      1,
      expect.objectContaining({ estado: 'rechazado', error: FUERA_DEL_RANGO }),
    );
  });

  it('«ya existe el documento» (L3): el folio que sigue, sin descartar rangos', async () => {
    const { folioSiguiente, procesar, mandar } = armar({
      procesar: [
        respuesta({
          resultado: 'rechazado',
          mensaje: 'Ya existe el documento folio 292104',
        }),
        respuesta({ resultado: 'emitido', folio: 292105 }),
      ],
      otro: 292105,
    });

    await mandar();

    expect(folioSiguiente).toHaveBeenLastCalledWith(56, []);
    expect(procesar).toHaveBeenCalledTimes(2);
  });

  it('si el folio que vuelve es el mismo, no lo manda dos veces', async () => {
    const { procesar, mandar } = armar({
      procesar: [
        respuesta({ resultado: 'rechazado', mensaje: FUERA_DEL_RANGO }),
      ],
      otro: 292104,
    });

    await expect(mandar()).rejects.toBeInstanceOf(BadRequestException);
    expect(procesar).toHaveBeenCalledTimes(1);
  });

  it('otro rechazo (un dato del receptor): no se pide otro folio', async () => {
    const { folioSiguiente, procesar, mandar } = armar({
      procesar: [
        respuesta({
          resultado: 'rechazado',
          mensaje: 'RUT del receptor inválido',
        }),
      ],
    });

    await expect(mandar()).rejects.toBeInstanceOf(BadRequestException);
    expect(procesar).toHaveBeenCalledTimes(1);
    expect(folioSiguiente).toHaveBeenCalledTimes(1);
  });
});
