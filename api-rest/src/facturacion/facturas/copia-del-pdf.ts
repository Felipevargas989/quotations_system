import type { FacturacionCl } from '../facturacion-cl/facturacion-cl';
import type {
  DocumentoTributario,
  DocumentosTributariosRepository,
} from './documentos-tributarios.repository';

/**
 * LA COPIA PROPIA DEL PDF (doc 19, L10): el enlace de facturacion.cl es
 * público, así que Eventia guarda su copia en el balde privado. Si el
 * documento es de un evento, también queda en Documentos → Facturas del
 * evento (§9.2). La usan la factura (paso 2c) y la boleta (paso 3).
 */

const NOMBRE: Record<number, { archivo: string; titulo: string }> = {
  33: { archivo: 'factura', titulo: 'Factura' },
  39: { archivo: 'boleta', titulo: 'Boleta' },
  56: { archivo: 'nota_de_debito', titulo: 'Nota de débito' },
  61: { archivo: 'nota_de_credito', titulo: 'Nota de crédito' },
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
  const nombre = NOMBRE[doc.tipo] ?? {
    archivo: `dte_${doc.tipo}`,
    titulo: `Documento ${doc.tipo}`,
  };
  const sufijo = doc.ambiente === 'produccion' ? '' : `_${doc.ambiente}`;
  const archivo = `${nombre.archivo}_${doc.folio}${sufijo}.pdf`;
  const ruta = quotationId
    ? `c${companyId}/event-documents/${quotationId}/facturas/${archivo}`
    : `c${companyId}/documentos-tributarios/${archivo}`;
  await repo.guardarPdf(ruta, pdf);
  const conPdf = await repo.actualizar(doc.id, companyId, { pdf_path: ruta });
  if (quotationId)
    await repo.agregarAlEvento(
      quotationId,
      `${nombre.titulo} N° ${doc.folio}${doc.ambiente === 'simulado' ? ' (simulada)' : ''}.pdf`,
      ruta,
    );
  return conPdf;
}
