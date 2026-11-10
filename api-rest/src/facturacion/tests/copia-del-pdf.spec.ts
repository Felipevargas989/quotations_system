import type { FacturacionCl } from '../facturacion-cl/facturacion-cl';
import {
  guardarCopiaDelPdfAlEmitir,
  REINTENTOS_DEL_PDF_MS,
} from '../facturas/copia-del-pdf';
import type {
  DocumentosTributariosRepository,
  DocumentoTributario,
} from '../facturas/documentos-tributarios.repository';

// EL PDF SE PIDE SOLO (doc 19 §9.33; Felipe, 08-11: *"el PDF lo dejaría
// automático"*). En producción, facturacion.cl lo tiene un rato después de
// emitir (la factura N° 381 no lo tenía al emitirse y sí dos minutos
// después): si no llega al emitir, se vuelve a pedir por detrás.

const PDF = Buffer.from('%PDF-1.4 prueba', 'latin1');

const DOC = {
  id: 1,
  tipo: 33,
  folio: 381,
  estado: 'emitido',
  ambiente: 'produccion',
  pdf_path: null,
} as unknown as DocumentoTributario;

const armar = (pdfs: (Buffer | null)[], enLaBase = DOC) => {
  const obtenerPdf = jest.fn();
  for (const p of pdfs) obtenerPdf.mockResolvedValueOnce(p);
  obtenerPdf.mockResolvedValue(null);
  const conexion = { obtenerPdf } as unknown as FacturacionCl;
  const repo = {
    documento: jest.fn().mockResolvedValue(enLaBase),
    guardarPdf: jest.fn().mockResolvedValue(undefined),
    actualizar: jest
      .fn()
      .mockImplementation((_id: number, _c: number, cambios: object) =>
        Promise.resolve({ ...DOC, ...cambios }),
      ),
    agregarAlEvento: jest.fn().mockResolvedValue(undefined),
  } as unknown as DocumentosTributariosRepository;
  const registro = { info: jest.fn(), warn: jest.fn() };
  return { conexion, repo, registro, obtenerPdf };
};

/** Deja correr el reloj y las promesas que quedan pendientes. */
const avanzar = async (ms: number) => {
  await jest.advanceTimersByTimeAsync(ms);
};

describe('El PDF al emitir', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('si llega al emitir, queda guardado y no se vuelve a pedir', async () => {
    const { conexion, repo, registro, obtenerPdf } = armar([PDF]);
    const r = await guardarCopiaDelPdfAlEmitir(
      repo,
      conexion,
      DOC,
      1,
      null,
      registro,
    );
    expect(r.pdf_path).toBe('c1/documentos-tributarios/F381.pdf');
    await avanzar(REINTENTOS_DEL_PDF_MS.reduce((a, b) => a + b, 0));
    expect(obtenerPdf).toHaveBeenCalledTimes(1);
  });

  it('si no llega, se vuelve a pedir solo hasta que llega', async () => {
    const { conexion, repo, registro, obtenerPdf } = armar([null, null, PDF]);
    const r = await guardarCopiaDelPdfAlEmitir(
      repo,
      conexion,
      DOC,
      1,
      null,
      registro,
    );
    // Quien emite no espera: sale sin PDF.
    expect(r.pdf_path).toBeNull();
    await avanzar(REINTENTOS_DEL_PDF_MS[0]);
    expect(obtenerPdf).toHaveBeenCalledTimes(2);
    await avanzar(REINTENTOS_DEL_PDF_MS[1]);
    expect(obtenerPdf).toHaveBeenCalledTimes(3);
    expect(repo.actualizar).toHaveBeenCalledWith(1, 1, {
      pdf_path: 'c1/documentos-tributarios/F381.pdf',
    });
    expect(registro.info).toHaveBeenCalledWith(
      'PDF del documento 381: llegó en el intento 3',
    );
    // Llegó: no se pide más.
    await avanzar(REINTENTOS_DEL_PDF_MS.reduce((a, b) => a + b, 0));
    expect(obtenerPdf).toHaveBeenCalledTimes(3);
  });

  it('si alguien ya lo trajo, no se pide de nuevo', async () => {
    const { conexion, repo, registro, obtenerPdf } = armar([null], {
      ...DOC,
      pdf_path: 'c1/documentos-tributarios/F381.pdf',
    });
    await guardarCopiaDelPdfAlEmitir(repo, conexion, DOC, 1, null, registro);
    await avanzar(REINTENTOS_DEL_PDF_MS.reduce((a, b) => a + b, 0));
    expect(obtenerPdf).toHaveBeenCalledTimes(1);
  });

  it('si nunca llega, lo dice en el registro y se baja al descargarlo', async () => {
    const { conexion, repo, registro, obtenerPdf } = armar([]);
    await guardarCopiaDelPdfAlEmitir(repo, conexion, DOC, 1, null, registro);
    await avanzar(REINTENTOS_DEL_PDF_MS.reduce((a, b) => a + b, 0) + 1);
    expect(obtenerPdf).toHaveBeenCalledTimes(REINTENTOS_DEL_PDF_MS.length + 1);
    expect(registro.warn).toHaveBeenCalledWith(
      `PDF del documento 381: no llegó en ${REINTENTOS_DEL_PDF_MS.length} intentos; se baja al descargarlo`,
    );
  });
});
