import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import MultiSelect from "../../components/MultiSelect";
import {
  AudienciasMarketing,
  FiltroSegmento,
  previaSegmento,
} from "../../services/marketing.service";

/**
 * EL CONSTRUCTOR DE AUDIENCIAS (Fase 3). Felipe lo dejó en TRES filtros
 * (25-08): qué pasó con ellos (Nos compró = aceptadas y realizadas /
 * No nos compró = rechazadas y anuladas), tipo de cliente y tipo de
 * evento — cada uno con su "Todos". Las condiciones se suman, y la
 * previa de la derecha se recalcula en vivo: cuántos son y quiénes.
 * Los nombres de negocio son los que él validó ese día.
 */

const ACEPTO: FiltroSegmento["con_estados"] = ["aceptada", "realizada"];
const NO_ACEPTO: FiltroSegmento["con_estados"] = ["rechazada", "anulada"];

export default function SegmentoBuilder({
  audiencias,
  filtro,
  onFiltro,
  encabezado,
}: {
  readonly audiencias?: AudienciasMarketing;
  readonly filtro: FiltroSegmento;
  readonly onFiltro: (f: FiltroSegmento) => void;
  /** Título y explicación de la caja: viven en la columna izquierda
   *  para que la previa suba hasta casi arriba (Felipe, 25-08). */
  readonly encabezado?: ReactNode;
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

  // Las listas largas van en la pieza de la casa (MultiSelect): vacío
  // significa "Todos". Los chips quedan solo para el filtro de 3.
  const ponerLista = (
    campo: "tipos_cliente" | "tipos_evento",
    valores: string[],
  ) => {
    onFiltro({ ...filtro, [campo]: valores.length ? valores : undefined });
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
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_460px] gap-4">
      <div className="space-y-3">
        {encabezado}
        <div>
          <p className={seccion}>Qué pasó con ellos</p>
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
              Nos compró
            </button>
            <button
              type="button"
              onClick={() => onFiltro({ ...filtro, con_estados: NO_ACEPTO })}
              className={chip(resultado === "no_acepto")}
              title="Cotizó pero rechazó o anuló"
            >
              No nos compró
            </button>
          </div>
        </div>

        <div>
          <p className={seccion}>Tipo de cliente</p>
          <div className="mt-1">
            <MultiSelect
              options={(audiencias?.tipos ?? []).map((t) => ({
                value: t.tipo,
                label: `${t.tipo} (${String(t.conCorreo)})`,
              }))}
              value={filtro.tipos_cliente ?? []}
              onChange={(v) => ponerLista("tipos_cliente", v)}
              placeholder="Todos los tipos de cliente"
            />
          </div>
        </div>

        <div>
          <p className={seccion}>Tipo de evento</p>
          <div className="mt-1">
            <MultiSelect
              options={(audiencias?.tipos_evento ?? []).map((t) => ({
                value: t.tipo,
                label: `${t.tipo} (${String(t.n)})`,
              }))}
              value={filtro.tipos_evento ?? []}
              onChange={(v) => ponerLista("tipos_evento", v)}
              placeholder="Todos los tipos de evento"
            />
          </div>
        </div>
      </div>

      {/* La previa en vivo: el espejo del segmento. Recuadro de alto
          FIJO (pedido de Felipe 25-08): en pantalla ancha va ANCLADA
          (absolute inset-0) al alto de la columna de filtros — no puede
          crecer con su contenido, solo la lista corre adentro. El primer
          intento (flex + stretch) no servía: la celda de la grilla se
          agrandaba con la caja y el scroll no aparecía nunca. */}
      <div className="relative lg:min-h-[27rem]">
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 flex flex-col h-96 lg:h-auto lg:absolute lg:inset-0">
        <p className="text-sm text-gray-600 shrink-0">
          Este segmento hoy son{" "}
          <span className="text-xl font-bold text-gray-900 tabular-nums">
            {previa.data?.total ?? "…"}
          </span>{" "}
          contactos
        </p>
        {/* LA LISTA EN TRES COLUMNAS (Felipe 25-08): cliente, contacto
            y correo, del alto completo desde arriba; corre adentro. */}
        <div className="grid grid-cols-[1.1fr_0.9fr_1.2fr] gap-x-2 mt-2 pb-1 border-b border-gray-200 text-[10px] font-semibold uppercase tracking-wide text-gray-400 shrink-0">
          <span>Cliente</span>
          <span>Contacto</span>
          <span>Correo</span>
        </div>
        <ul className="flex-1 min-h-0 overflow-y-auto text-xs divide-y divide-gray-100">
          {(previa.data?.muestra ?? []).map((m) => (
            <li
              key={m.email}
              className="grid grid-cols-[1.1fr_0.9fr_1.2fr] gap-x-2 py-1"
            >
              <span className="truncate text-gray-900" title={m.cliente}>
                {m.cliente}
              </span>
              <span
                className="truncate text-gray-500"
                title={m.contacto ?? undefined}
              >
                {m.contacto ?? "—"}
              </span>
              <span className="truncate text-gray-400" title={m.email}>
                {m.email}
              </span>
            </li>
          ))}
          {(previa.data?.total ?? 0) > (previa.data?.muestra.length ?? 0) && (
            <li className="py-1 text-gray-400">
              … y {(previa.data?.total ?? 0) - (previa.data?.muestra.length ?? 0)}{" "}
              más
            </li>
          )}
        </ul>
        <p className="text-[11px] text-gray-400 mt-2 shrink-0">
          Se recalcula en vivo contra tu base al momento de enviar — nunca
          listas viejas. Los dados de baja ya están descontados.
        </p>
      </div>
      </div>
    </div>
  );
}
