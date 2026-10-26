import {
  esOpcional,
  type EstadoDelDocumento,
  type FilaDelChecklist,
  resumenDelChecklist,
} from "./checklistDeDocumentos";
import TituloDeBloque from "./TituloDeBloque";

// LOS DOCUMENTOS A PRESENTAR (19-10). Felipe: "un checklist documental para
// saber si tengo toda la documentación... un cruce de documentación que ya
// tengo en el sistema y documentación que debo conseguir". Solo documentos;
// lo que hay que cumplir u ofrecer va en las exigencias. UNA SOLA LISTA, la
// de postular (Felipe, 19-10: "así dejamos una sola lista para efectos de
// la postulación, que es nuestro foco ahora"): lo que piden al adjudicar o
// para el pago (el DICOM, el F30) va al final como opcional, y la factura
// del pago no va (`checklistDeDocumentos`).
//
// Desde la decisión 80 (26-10) es el bloque 4 de «Bases y criterios», «Lo
// que tienes que presentar», agrupado por parte del portal. Los formularios
// están aquí con su estado: la lista aparte de «Formularios para llenar»
// se quitó porque los repetía. El cruce lo hace `useChecklistDeDocumentos`,
// que también usan «Cómo te evalúan» y «Lo que te deja fuera».

const ESTADOS: Record<EstadoDelDocumento, { texto: string; clases: string }> = {
  firmado: { texto: "Firmado", clases: "bg-green-100 text-green-800" },
  en_tu_carpeta: {
    texto: "En tu carpeta",
    clases: "bg-green-100 text-green-800",
  },
  en_tu_postulacion: {
    texto: "En tu postulación",
    clases: "bg-green-100 text-green-800",
  },
  hecho: { texto: "Falta firmar", clases: "bg-amber-100 text-amber-800" },
  lo_arma_la_ia: {
    texto: "Lo arma la IA",
    clases: "bg-blue-100 text-blue-800",
  },
  vencido: { texto: "Vencido", clases: "bg-red-100 text-red-800" },
  falta: { texto: "Falta", clases: "bg-red-100 text-red-800" },
  no_aplica: { texto: "No aplica", clases: "bg-gray-100 text-gray-500" },
};

/** Lo que se pide al adjudicar o para el pago no hace falta para postular:
 *  no va en rojo. */
const OPCIONAL = { texto: "Opcional", clases: "bg-gray-100 text-gray-600" };

const CUANDO_LO_PIDEN: Record<FilaDelChecklist["cuando"], string | null> = {
  con_la_oferta: null,
  al_adjudicar: "lo piden al adjudicar",
  al_pagar: "lo piden para el pago",
};

/** En el orden del portal de Mercado Público. */
const PARTES: ReadonlyArray<[FilaDelChecklist["parte"], string]> = [
  ["administrativa", "Administrativa"],
  ["tecnica", "Técnica"],
  ["economica", "Económica"],
  ["otra", "Otra"],
];

function Fila({ f }: { readonly f: FilaDelChecklist }) {
  const opcional = esOpcional(f);
  const estado =
    f.estado === "falta" && opcional ? OPCIONAL : ESTADOS[f.estado];
  const detalle = [
    opcional ? `opcional: ${CUANDO_LO_PIDEN[f.cuando]}` : null,
    f.condicion || null,
  ].filter(Boolean);
  return (
    <li className="px-3 py-2 flex flex-wrap items-start gap-3">
      <div className="min-w-0 flex-1 space-y-0.5">
        <p className="text-sm text-gray-800">
          {f.nombre}
          {f.pagina > 0 && (
            <span className="text-xs text-gray-400"> (pág. {f.pagina})</span>
          )}
        </p>
        {(detalle.length > 0 || (f.obligatorio && !opcional)) && (
          <p className="text-xs text-gray-500">
            {detalle.join(" · ")}
            {f.obligatorio && !opcional && (
              <span className="text-red-700">
                {detalle.length > 0 ? " · " : ""}si falta, quedas fuera
              </span>
            )}
          </p>
        )}
        {f.detalle && (
          <p className="text-xs text-gray-400 break-all">{f.detalle}</p>
        )}
      </div>
      <span
        className={`shrink-0 px-2 py-0.5 text-xs font-semibold rounded ${estado.clases}`}
      >
        {estado.texto}
      </span>
    </li>
  );
}

export default function DocumentosAPresentar({
  filas,
  sinChecklist,
}: {
  readonly filas: FilaDelChecklist[];
  /** El análisis es de antes del checklist (19-10): falta la vigencia. */
  readonly sinChecklist: boolean;
}) {
  if (filas.length === 0) return null;
  const { listos, faltan, total } = resumenDelChecklist(filas);

  return (
    <section className="bg-white rounded-lg shadow p-5 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">
          <TituloDeBloque numero={4}>
            Lo que tienes que presentar
          </TituloDeBloque>
        </h2>
        <p className="text-xs text-gray-500">
          Para postular: {listos} de {total} listos
          {faltan > 0 && (
            <span className="font-semibold text-red-700">
              {" "}
              · {faltan} {faltan === 1 ? "falta" : "faltan"}
            </span>
          )}
        </p>
      </div>
      {sinChecklist && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Vuelve a analizar las bases para el checklist completo: incluye la
          vigencia de cada documento.
        </p>
      )}

      {PARTES.map(([parte, nombre]) => {
        const suyas = filas.filter((f) => f.parte === parte);
        if (suyas.length === 0) return null;
        return (
          <div key={parte} className="space-y-1">
            <h3 className="text-xs font-semibold text-gray-600">{nombre}</h3>
            <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
              {suyas.map((f, i) => (
                <Fila key={`${f.nombre}-${i}`} f={f} />
              ))}
            </ul>
          </div>
        );
      })}
      <p className="text-xs text-gray-400">
        Cruzado con tu carpeta de «Mi empresa» (con su vencimiento contra el
        cierre) y con «Mi postulación».
      </p>
    </section>
  );
}
