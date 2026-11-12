import type { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";

// LAS PIEZAS DE LA PANTALLA DE UN DOCUMENTO (doc 19 §9.22), las mismas en
// la factura, la boleta y las notas de «Nuevo documento», como la maqueta
// que aprobó Felipe el 06-11: arriba «← Documentos» y el título (con el N°
// que sigue, si ya se sabe), y el documento en secciones blancas.

/** «← Documentos», el título y, si ya se sabe, «N° … · el siguiente». */
export function CabeceraDelDocumento({
  titulo,
  folio = null,
  onVolver,
}: {
  readonly titulo: string;
  readonly folio?: number | null;
  readonly onVolver: () => void;
}) {
  return (
    <>
      <button
        type="button"
        onClick={onVolver}
        className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline"
      >
        <ArrowLeft size={15} /> Documentos
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-gray-900">{titulo}</h1>
        {folio != null && folio > 0 && (
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
            N° {folio} · el siguiente
          </span>
        )}
      </div>
    </>
  );
}

/** Una sección del documento, con su título si lo lleva. */
export function Seccion({
  titulo,
  opcional = false,
  children,
}: {
  readonly titulo?: string;
  /** La sección entera se puede dejar en blanco: lo dice una etiqueta
   *  gris junto al título (Felipe, 12-11-2026). */
  readonly opcional?: boolean;
  readonly children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      {titulo && (
        <h2 className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          {titulo}
          {opcional && (
            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600">
              Opcional
            </span>
          )}
        </h2>
      )}
      {children}
    </section>
  );
}
