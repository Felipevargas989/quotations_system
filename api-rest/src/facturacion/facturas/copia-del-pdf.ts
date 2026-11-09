import { mensajeDe } from 'src/logging/mensaje-de-error';
import type {
  AmbienteDeFacturacion,
  FacturacionCl,
} from '../facturacion-cl/facturacion-cl';
import type {
  DocumentoTributario,
  DocumentosTributariosRepository,
} from './documentos-tributarios.repository';
import {
  nombreDelPdfDe,
  nombreEnElEvento,
  nombreParaElBalde,
} from './nombre-del-pdf';

/**
 * LA COPIA PROPIA DEL PDF (doc 19, L10): el enlace de facturacion.cl es
 * público, así que Eventia guarda su copia en el balde privado. Si el
 * documento es de un evento, también queda en Documentos → Facturas del
 * evento (§9.2). La usan la factura (paso 2c) y la boleta (paso 3).
 */

/** Lo que no es de producción lo dice en el nombre de Documentos. */
const EN_EL_NOMBRE: Partial<Record<AmbienteDeFacturacion, string>> = {
  simulado: ' (simulada)',
  prueba: ' (prueba)',
};

export async function guardarCopiaDelPdf(
  repo: DocumentosTributariosRepository,
  conexion: FacturacionCl,
  doc: DocumentoTributario,
  companyId: number,
  quotationId: string | null,
): Promise<DocumentoTributario> {
  if (doc.folio == null) return doc;
  const pdf = await conexion.obtenerPdf(doc.tipo, doc.folio);
  // Todavía no está: la pantalla dice «PDF en camino» (§9.10).
  if (!pdf) return doc;
  // §9.35: «F383_cliente_460_OC». Si no se pueden leer el cliente, la
  // cotización o la OC, va con lo que hay: la copia no se pierde por eso.
  const datos = await Promise.resolve()
    .then(() => repo.datosDelNombreDelPdf(doc.id, companyId))
    .catch(() => null);
  const nombre = nombreDelPdfDe({
    ...datos,
    tipo: doc.tipo,
    folio: doc.folio,
  });
  const sufijo = doc.ambiente === 'produccion' ? '' : `_${doc.ambiente}`;
  const archivo = `${nombreParaElBalde(nombre)}${sufijo}.pdf`;
  const ruta = quotationId
    ? `c${companyId}/event-documents/${quotationId}/facturas/${archivo}`
    : `c${companyId}/documentos-tributarios/${archivo}`;
  await repo.guardarPdf(ruta, pdf);
  const conPdf = await repo.actualizar(doc.id, companyId, { pdf_path: ruta });
  // §9.39: en Documentos del evento, con un nombre que se lee («Factura
  // N° 386 · $2.805.800»): uno que termina en «.pdf» no se muestra.
  if (quotationId)
    await repo.agregarAlEvento(
      quotationId,
      `${nombreEnElEvento(doc)}${EN_EL_NOMBRE[doc.ambiente] ?? ''}`,
      ruta,
    );
  return conPdf;
}

/**
 * Cuándo se vuelve a pedir el PDF que no llegó al emitir (§9.33): en
 * producción, facturacion.cl lo tiene un rato después de mandar el
 * documento al SII. Medido el 08-11: la factura N° 381 no lo tenía al
 * emitirse y sí dos minutos después; Felipe: *"me da la sensación que si
 * le das unos segundos ya lo trae solo, prueba con 5 a 10 segundos"*. Se
 * pide a los 5 y a los 10 segundos, y después más espaciado, hasta unos
 * 9 minutos.
 */
export const REINTENTOS_DEL_PDF_MS = [
  5_000, 5_000, 10_000, 20_000, 60_000, 120_000, 300_000,
];

interface Registro {
  info(texto: string): void;
  warn(texto: string): void;
}

/**
 * La copia del PDF al emitir, y si todavía no llega, se vuelve a pedir
 * sola por detrás unas veces (Felipe, 08-11: *"el PDF lo dejaría
 * automático, ese siempre se debe extraer solo desde facturación.cl"*).
 * Quien emite no espera: el documento sale con lo que hay, y si al final
 * no llega, se baja al descargarlo (`pedirPdf`).
 */
export async function guardarCopiaDelPdfAlEmitir(
  repo: DocumentosTributariosRepository,
  conexion: FacturacionCl,
  doc: DocumentoTributario,
  companyId: number,
  quotationId: string | null,
  registro: Registro,
  esperas: readonly number[] = REINTENTOS_DEL_PDF_MS,
): Promise<DocumentoTributario> {
  const conPdf = await guardarCopiaDelPdf(
    repo,
    conexion,
    doc,
    companyId,
    quotationId,
  ).catch((e: unknown) => {
    registro.warn(`PDF del documento ${doc.folio}: ${mensajeDe(e)}`);
    return doc;
  });
  if (!conPdf.pdf_path && doc.folio != null)
    reintentarElPdf(
      repo,
      conexion,
      doc,
      companyId,
      quotationId,
      registro,
      esperas,
      0,
    );
  return conPdf;
}

function reintentarElPdf(
  repo: DocumentosTributariosRepository,
  conexion: FacturacionCl,
  doc: DocumentoTributario,
  companyId: number,
  quotationId: string | null,
  registro: Registro,
  esperas: readonly number[],
  intento: number,
): void {
  if (intento >= esperas.length) {
    registro.warn(
      `PDF del documento ${doc.folio}: no llegó en ${esperas.length} intentos; se baja al descargarlo`,
    );
    return;
  }
  const espera = setTimeout(() => {
    void (async () => {
      try {
        const ahora = await repo.documento(doc.id, companyId);
        // Ya llegó (lo pidió alguien) o ya no está emitido: nada que hacer.
        if (!ahora || ahora.pdf_path || ahora.estado !== 'emitido') return;
        const conPdf = await guardarCopiaDelPdf(
          repo,
          conexion,
          ahora,
          companyId,
          quotationId,
        );
        if (conPdf.pdf_path) {
          registro.info(
            `PDF del documento ${doc.folio}: llegó en el intento ${intento + 2}`,
          );
          return;
        }
      } catch (e) {
        registro.warn(`PDF del documento ${doc.folio}: ${mensajeDe(e)}`);
      }
      reintentarElPdf(
        repo,
        conexion,
        doc,
        companyId,
        quotationId,
        registro,
        esperas,
        intento + 1,
      );
    })();
  }, esperas[intento]);
  espera.unref?.();
}
