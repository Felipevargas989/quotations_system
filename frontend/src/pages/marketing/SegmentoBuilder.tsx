import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import NumberInput from "../../components/inputs/NumberInput";
import {
  AudienciasMarketing,
  FiltroSegmento,
  previaSegmento,
} from "../../services/marketing.service";

/**
 * EL CONSTRUCTOR DE SEGMENTOS (Fase 3, Felipe 25-08: "quiero ver cómo
 * crear audiencias desde los datos que ya tengo"). Cada chip que
 * enciendes es una condición que se SUMA (Y), y la previa de la derecha
 * se recalcula en vivo contra tu base: cuántos son y quiénes.
 */
export default function SegmentoBuilder({
  audiencias,
  filtro,
  onFiltro,
}: {
  readonly audiencias?: AudienciasMarketing;
  readonly filtro: FiltroSegmento;
  readonly onFiltro: (f: FiltroSegmento) => void;
}) {
  const [texto, setTexto] = useState(() => JSON.stringify(filtro));
  useEffect(() => setTexto(JSON.stringify(filtro)), [filtro]);

  // La previa en vivo, con un respiro para no bombardear al servidor.
  const [quieto, setQuieto] = useState(filtro);
  useEffect(() => {
    const t = setTimeout(() => setQuieto(filtro), 350);
    return () => clearTimeout(t);
  }, [texto]); // eslint-disable-line react-hooks/exhaustive-deps
  const previa = useQuery({
    queryKey: ["marketing", "segmento-previa", JSON.stringify(quieto)],
    queryFn: () => previaSegmento(quieto),
  });

  const toggleLista = (
    campo: "tipos_cliente" | "con_estados" | "tipos_evento",
    valor: string,
  ) => {
    const actual = new Set<string>((filtro[campo] as string[]) ?? []);
    if (actual.has(valor)) actual.delete(valor);
    else actual.add(valor);
    onFiltro({
      ...filtro,
      [campo]: actual.size ? [...actual] : undefined,
    });
  };

  const chip = (activo: boolean) =>
    `px-2.5 py-1 text-xs rounded-full border tabular-nums ${
      activo
        ? "bg-blue-50 text-blue-700 border-blue-300 font-medium"
        : "text-gray-600 border-gray-200 hover:bg-gray-50"
    }`;

  const seccion = "text-[11px] font-semibold uppercase tracking-wide text-gray-500";

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_290px] gap-4">
      <div className="space-y-3">
        <div>
          <p className={seccion}>Tipo de cliente</p>
          <div className="flex flex-wrap gap-1.5 mt-1">
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
          <p className={seccion}>Su historia con nosotros</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            {(
              [
                ["realizada", "Con evento realizado"],
                ["aceptada", "Con evento aceptado"],
                ["rechazada", "Nos rechazó una cotización"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => toggleLista("con_estados", v)}
                className={chip(!!filtro.con_estados?.includes(v))}
              >
                {label}
              </button>
            ))}
            {!!filtro.con_estados?.length && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                entre
                <input
                  type="date"
                  value={filtro.evento_desde ?? ""}
                  onChange={(e) =>
                    onFiltro({ ...filtro, evento_desde: e.target.value || undefined })
                  }
                  className="border border-gray-300 rounded-lg px-2 py-1"
                />
                y
                <input
                  type="date"
                  value={filtro.evento_hasta ?? ""}
                  onChange={(e) =>
                    onFiltro({ ...filtro, evento_hasta: e.target.value || undefined })
                  }
                  className="border border-gray-300 rounded-lg px-2 py-1"
                />
              </span>
            )}
          </div>
        </div>

        <div>
          <p className={seccion}>Momentos</p>
          <div className="flex flex-wrap items-center gap-1.5 mt-1">
            <button
              type="button"
              onClick={() =>
                onFiltro({ ...filtro, aniversario: filtro.aniversario ? undefined : true })
              }
              className={chip(!!filtro.aniversario)}
              title="Evento realizado hace 11 a 13 meses: se acerca el aniversario"
            >
              🎂 Aniversario de su evento (~1 año)
            </button>
            <button
              type="button"
              onClick={() =>
                onFiltro({
                  ...filtro,
                  sin_cotizacion_desde: filtro.sin_cotizacion_desde
                    ? undefined
                    : `${String(new Date().getFullYear())}-01-01`,
                })
              }
              className={chip(!!filtro.sin_cotizacion_desde)}
              title="No nos ha cotizado nada desde la fecha"
            >
              💤 Dormidos
            </button>
            {!!filtro.sin_cotizacion_desde && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                sin cotizar desde
                <input
                  type="date"
                  value={filtro.sin_cotizacion_desde}
                  onChange={(e) =>
                    onFiltro({
                      ...filtro,
                      sin_cotizacion_desde: e.target.value || undefined,
                    })
                  }
                  className="border border-gray-300 rounded-lg px-2 py-1"
                />
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <p className={seccion}>Presupuesto histórico</p>
            <div className="relative mt-1 w-44">
              <span className="absolute left-2 top-1/2 -translate-y-1/2 text-xs text-gray-400 pointer-events-none">
                $ desde
              </span>
              <NumberInput
                value={filtro.monto_min || undefined}
                onChange={(v) =>
                  onFiltro({ ...filtro, monto_min: v || undefined })
                }
                formatThousands
                placeholder="0"
                aria-label="Monto mínimo histórico"
                className="w-full !pl-14 !pr-2 !py-1.5 !rounded-lg text-sm text-right"
              />
            </div>
            <p className="text-[11px] text-gray-400 mt-0.5">
              Su mayor evento aceptado o realizado
            </p>
          </div>
          <div>
            <p className={seccion}>Tipo de evento</p>
            <div className="flex flex-wrap gap-1.5 mt-1">
              {(audiencias?.tipos_evento ?? []).slice(0, 8).map((t) => (
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
              … y {(previa.data?.total ?? 0) - (previa.data?.muestra.length ?? 0)} más
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
