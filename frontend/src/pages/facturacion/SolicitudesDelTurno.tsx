import { useQuery } from "@tanstack/react-query";
import FileViewLink from "../../components/FileViewLink";
import { getSolicitudesDelTurno } from "../../services/solicitudes.service";
import ChipDeSolicitud from "./ChipDeSolicitud";
import { LLAVE_DEL_TURNO, clp, horaDe, nombreDelTipo } from "./solicitudes";

// LAS SOLICITUDES DE ESTE TURNO (doc 19 §9.45), para recepción: cómo va cada
// una que mandó (pendiente, emitida o rechazada) y, emitida, su N° y su
// PDF. Se pone al día sola mientras alguna espera.

export default function SolicitudesDelTurno() {
  const consulta = useQuery({
    queryKey: LLAVE_DEL_TURNO,
    queryFn: getSolicitudesDelTurno,
    refetchInterval: (q) =>
      q.state.data?.solicitudes.some(
        (s) => s.estado === "pendiente" || s.estado === "emitiendo",
      )
        ? 20_000
        : false,
  });
  const solicitudes = consulta.data?.solicitudes ?? [];
  if (!solicitudes.length) return null;
  return (
    <section className="rounded-xl border border-gray-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-gray-900">
        Tus solicitudes de este turno
      </h2>
      <ul className="divide-y divide-gray-100">
        {solicitudes.map((s) => (
          <li
            key={s.id}
            className="grid grid-cols-[4rem_minmax(0,1fr)_6rem_7rem] items-start gap-2 py-2 text-sm"
          >
            <span className="text-xs text-gray-500">
              {horaDe(s.created_at)}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-gray-900">
                {nombreDelTipo(s.tipo)}
                {s.para ? ` · ${s.para}` : ""}
              </span>
              <span className="block truncate text-xs text-gray-500">
                {s.lineas.map((l) => l.descripcion).join(", ")}
              </span>
            </span>
            <span className="text-right text-gray-900">{clp(s.total)}</span>
            <span className="text-right">
              <ChipDeSolicitud solicitud={s} />
              {s.estado === "aprobada" && s.documento?.pdf_path && (
                <span className="mt-0.5 block text-xs">
                  <FileViewLink
                    url={s.documento.pdf_path}
                    title={`${nombreDelTipo(s.tipo)} ${s.documento.folio ?? ""}.pdf`}
                  />
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
