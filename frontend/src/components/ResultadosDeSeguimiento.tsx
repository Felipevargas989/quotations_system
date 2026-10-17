import { AlertTriangle, ExternalLink, Mail, X } from "lucide-react";
import { Link } from "react-router-dom";
import type { ResultadoDeSeguimiento } from "../hooks/useSeguimientoConIA";

// Lo que dejó «Generar seguimiento» en esta visita al tablero (17-10-2026,
// doc 18): cada borrador con su enlace a Outlook, para revisarlo y enviarlo
// desde ahí; lo que se saltó o falló, con el motivo. La misma forma que
// ResultadosDeIA de Requerimientos.
export default function ResultadosDeSeguimiento({
  resultados,
  onCerrar,
}: {
  readonly resultados: ResultadoDeSeguimiento[];
  readonly onCerrar: () => void;
}) {
  if (resultados.length === 0) return null;
  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 p-4 text-sm">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-1.5 font-semibold text-violet-900">
          <Mail size={16} aria-hidden />
          Seguimientos con IA: revísalos en Outlook y envíalos desde ahí
        </p>
        <button
          type="button"
          onClick={onCerrar}
          className="text-violet-500 hover:text-violet-800"
          title="Cerrar"
        >
          <X size={16} />
        </button>
      </div>
      <ul className="space-y-1">
        {resultados.map((r) =>
          r.accion === "borrador" ? (
            <li key={r.id} className="flex flex-wrap items-center gap-x-2">
              <Link
                to={`/negocio/${r.id}`}
                className="font-medium text-violet-900 hover:underline"
              >
                N° {r.numero}
              </Link>
              <span className="text-violet-900">{r.detalle}</span>
              {r.enlace && (
                <a
                  href={r.enlace}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-violet-700 hover:text-violet-900"
                >
                  <ExternalLink size={13} aria-hidden />
                  Abrir en Outlook
                </a>
              )}
            </li>
          ) : (
            <li key={r.id} className="flex items-start gap-1.5 text-amber-800">
              <AlertTriangle
                size={14}
                className="mt-0.5 shrink-0"
                aria-hidden
              />
              <span>
                <Link
                  to={`/negocio/${r.id}`}
                  className="font-medium hover:underline"
                >
                  N° {r.numero}
                </Link>
                {r.accion === "saltada" ? ": no se escribió, " : ": "}
                {r.detalle}
              </span>
            </li>
          ),
        )}
      </ul>
    </div>
  );
}
