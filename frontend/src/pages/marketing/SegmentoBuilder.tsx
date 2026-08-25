import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AudienciasMarketing,
  FiltroSegmento,
  previaSegmento,
} from "../../services/marketing.service";

/**
 * EL CONSTRUCTOR DE SEGMENTOS (Fase 3). Felipe lo dejó en TRES filtros
 * (25-08): resultado (Aceptó = aceptadas y realizadas / No aceptó =
 * rechazadas y anuladas), tipo de cliente y tipo de evento — cada uno
 * con su "Todos". Las condiciones se suman, y la previa de la derecha
 * se recalcula en vivo: cuántos son y quiénes.
 */

const ACEPTO: FiltroSegmento["con_estados"] = ["aceptada", "realizada"];
const NO_ACEPTO: FiltroSegmento["con_estados"] = ["rechazada", "anulada"];

export default function SegmentoBuilder({
  audiencias,
  filtro,
  onFiltro,
}: {
  readonly audiencias?: AudienciasMarketing;
  readonly filtro: FiltroSegmento;
  readonly onFiltro: (f: FiltroSegmento) => void;
}) {
  // La previa en vivo, con un respiro para no bombardear al servidor.
  const [quieto, setQuieto] = useState(filtro);
  useEffect(() => {
    const t = setTimeout(() => setQuieto(filtro), 350);
    return () => clearTimeout(t);
  }, [JSON.stringify(filtro)]); // eslint-disable-line react-hooks/exhaustive-deps
  const previa = useQuery({
    queryKey: ["marketing", "segmento-previa", JSON.stringify(quieto)],
    queryFn: () => previaSegmento(quieto),
  });

  const resultado =
    JSON.stringify(filtro.con_estados) === JSON.stringify(ACEPTO)
      ? "acepto"
      : JSON.stringify(filtro.con_estados) === JSON.stringify(NO_ACEPTO)
        ? "no_acepto"
        : "todos";

  const toggleLista = (
    campo: "tipos_cliente" | "tipos_evento",
    valor: string,
  ) => {
    const actual = new Set<string>(filtro[campo] ?? []);
    if (actual.has(valor)) actual.delete(valor);
    else actual.add(valor);
    onFiltro({ ...filtro, [campo]: actual.size ? [...actual] : undefined });
  };

  const chip = (activo: boolean) =>
    `px-2.5 py-1 text-xs rounded-full border tabular-nums ${
      activo
        ? "bg-blue-50 text-blue-700 border-blue-300 font-medium"
        : "text-gray-600 border-gray-200 hover:bg-gray-50"
    }`;
  const seccion =
    "text-[11px] font-semibold uppercase tracking-wide text-gray-500";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_290px] gap-4">
      <div className="space-y-3">
        <div>
          <p className={seccion}>Resultado con nosotros</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <button
              type="button"
              onClick={() => onFiltro({ ...filtro, con_estados: undefined })}
              className={chip(resultado === "todos")}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => onFiltro({ ...filtro, con_estados: ACEPTO })}
              className={chip(resultado === "acepto")}
              title="Tuvo al menos una cotización aceptada o un evento realizado"
            >
              Aceptó (incluye realizados)
            </button>
            <button
              type="button"
              onClick={() => onFiltro({ ...filtro, con_estados: NO_ACEPTO })}
              className={chip(resultado === "no_acepto")}
              title="Nos rechazó o anuló alguna cotización"
            >
              No aceptó (incluye anulados)
            </button>
          </div>
        </div>

        <div>
          <p className={seccion}>Tipo de cliente</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <button
              type="button"
              onClick={() => onFiltro({ ...filtro, tipos_cliente: undefined })}
              className={chip(!filtro.tipos_cliente?.length)}
            >
              Todos
            </button>
            {(audiencias?.tipos ?? []).map((t) => (
              <button
                key={t.tipo}
                type="button"
                onClick={() => toggleLista("tipos_cliente", t.tipo)}
                className={chip(!!filtro.tipos_cliente?.includes(t.tipo))}
              >
                {t.tipo} ({t.conCorreo})
              </button>
            ))}
          </div>
        </div>

        <div>
          <p className={seccion}>Tipo de evento</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
            <button
              type="button"
              onClick={() => onFiltro({ ...filtro, tipos_evento: undefined })}
              className={chip(!filtro.tipos_evento?.length)}
            >
              Todos
            </button>
            {(audiencias?.tipos_evento ?? []).map((t) => (
              <button
                key={t.tipo}
                type="button"
                onClick={() => toggleLista("tipos_evento", t.tipo)}
                className={chip(!!filtro.tipos_evento?.includes(t.tipo))}
              >
                {t.tipo} ({t.n})
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* La previa en vivo: el espejo del segmento. */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 self-start">
        <p className="text-sm text-gray-600">
          Este segmento hoy son{" "}
          <span className="text-xl font-bold text-gray-900 tabular-nums">
            {previa.data?.total ?? "…"}
          </span>{" "}
          contactos
        </p>
        <ul className="mt-2 space-y-0.5 text-xs text-gray-600">
          {(previa.data?.muestra ?? []).map((m) => (
            <li key={m.email} className="truncate">
              {m.name ?? m.email}
              <span className="text-gray-400"> · {m.email}</span>
            </li>
          ))}
          {(previa.data?.total ?? 0) > (previa.data?.muestra.length ?? 0) && (
            <li className="text-gray-400">
              … y {(previa.data?.total ?? 0) - (previa.data?.muestra.length ?? 0)}{" "}
              más
            </li>
          )}
        </ul>
        <p className="text-[11px] text-gray-400 mt-2">
          Se recalcula en vivo contra tu base al momento de enviar — nunca
          listas viejas. Los dados de baja ya están descontados.
        </p>
      </div>
    </div>
  );
}
