import { useQuery } from "@tanstack/react-query";
import { FileCheck2 } from "lucide-react";
import {
  getAdjuntos,
  getOferente,
  type ResultadoDeBases,
} from "../../services/oportunidades.service";
import {
  checklistDeDocumentos,
  esOpcional,
  type EstadoDelDocumento,
  type FilaDelChecklist,
  resumenDelChecklist,
} from "./checklistDeDocumentos";

// LOS DOCUMENTOS A PRESENTAR (19-10). Felipe: "un checklist documental para
// saber si tengo toda la documentación... un cruce de documentación que ya
// tengo en el sistema y documentación que debo conseguir". Solo documentos;
// lo que hay que cumplir u ofrecer va en las exigencias. UNA SOLA LISTA, la
// de postular (Felipe, 19-10: "así dejamos una sola lista para efectos de
// la postulación, que es nuestro foco ahora"): lo que piden al adjudicar o
// para el pago (el DICOM, el F30) va al final como opcional, y la factura
// del pago no va (`checklistDeDocumentos`).

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

const PARTES: Record<FilaDelChecklist["parte"], string> = {
  administrativa: "Administrativa",
  tecnica: "Técnica",
  economica: "Económica",
  otra: "Otra",
};

/** El cierre, en el día de Chile (AAAA-MM-DD); sin cierre, hoy. */
const diaEnChile = (iso: string | null) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "America/Santiago" }).format(
    iso ? new Date(iso) : new Date(),
  );

export default function DocumentosAPresentar({
  oportunidadId,
  r,
  cierre,
}: {
  readonly oportunidadId: number;
  readonly r: Pick<
    ResultadoDeBases,
    "requisitos" | "formularios" | "documentos"
  >;
  readonly cierre: string | null;
}) {
  const { data: vista } = useQuery({
    queryKey: ["oportunidades", "oferente"],
    queryFn: getOferente,
  });
  const { data: postulacion = [] } = useQuery({
    queryKey: ["oportunidades", "adjuntos", oportunidadId, "postulacion"],
    queryFn: () => getAdjuntos(oportunidadId, "postulacion"),
  });
  const filas = checklistDeDocumentos({
    r,
    carpeta: vista?.documentos ?? [],
    postulacion,
    corte: diaEnChile(cierre),
  });
  if (filas.length === 0) return null;
  const { listos, faltan, total } = resumenDelChecklist(filas);

  return (
    <div className="p-3 rounded-lg border border-gray-200 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <FileCheck2 size={15} /> Documentos a presentar
        </h3>
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
      {!r.documentos?.length && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
          Vuelve a analizar las bases para el checklist completo: incluye la
          vigencia de cada documento.
        </p>
      )}

      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
        {filas.map((f, i) => {
          const opcional = esOpcional(f);
          const estado =
            f.estado === "falta" && opcional ? OPCIONAL : ESTADOS[f.estado];
          return (
            <li
              key={`${f.nombre}-${i}`}
              className="px-3 py-2 flex flex-wrap items-start gap-3"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm text-gray-800">
                  {f.nombre}
                  {f.pagina > 0 && (
                    <span className="text-xs text-gray-400">
                      {" "}
                      (pág. {f.pagina})
                    </span>
                  )}
                </p>
                <p className="text-xs text-gray-500">
                  {PARTES[f.parte]}
                  {opcional && ` · opcional: ${CUANDO_LO_PIDEN[f.cuando]}`}
                  {f.condicion && ` · ${f.condicion}`}
                  {f.obligatorio && !opcional && (
                    <span className="text-red-700">
                      {" "}
                      · si falta, quedas fuera
                    </span>
                  )}
                </p>
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
        })}
      </ul>
      <p className="text-xs text-gray-400">
        Cruzado con tu carpeta de «Mi empresa» (con su vencimiento contra el
        cierre) y con «Mi postulación».
      </p>
    </div>
  );
}
