import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Loader2 } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import ChipDeEstado from "../../components/ChipDeEstado";
import { toast } from "../../components/toast/Toast";
import {
  actualizarOportunidad,
  type EstadoOportunidad,
  type MiLicitacion,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatCurrency } from "../../utils/currencies";
import {
  formatFechaEvento,
  formatMomento,
  hoyEnChile,
} from "../../utils/dates";
import { type ConServicio, cuandoEsElServicio } from "./servicioDeLaGanada";
import {
  cuandoCierra,
  ESTADOS,
  ESTILO_DEL_PASO,
  pasosDelAvance,
} from "./oportunidades.utils";
import {
  type ConResultado,
  colorDelResultado,
  textoDelResultado,
} from "./resultadoDeCompraAgil";
import SelloDeTipo from "./SelloDeTipo";
import { useResponsables } from "./useResponsables";

// LA TARJETA de una licitación marcada, en «Mis licitaciones» y, desde la
// decisión 100 (28-10), en «Ganadas». Al pincharla se abre su ficha.

export default function TarjetaDeLicitacion({
  m,
  lista = false,
  ganada,
}: {
  readonly m: MiLicitacion;
  /** Postulada: lista, en verde. */
  readonly lista?: boolean;
  /** Ganada (decisión 100): a la derecha, el servicio en vez del cierre;
   *  por cumplir, en dorado. */
  readonly ganada?: "por_cumplir" | "cumplida";
}) {
  const qc = useQueryClient();
  const navegar = useNavigate();
  const responsables = useResponsables();
  const p = m.proceso;
  const cierre = cuandoCierra(p.fecha_cierre);
  const responsable = responsables.find((r) => r.value === m.responsable_id);
  // Decisión 92: ganada o perdida por la orden de compra.
  const resultado = (m as ConResultado).resultado;

  const cambiar = useMutation({
    mutationFn: (estado: EstadoOportunidad) =>
      actualizarOportunidad(m.id, { estado }),
    onSuccess: () => {
      toast.success("Guardado.");
      void qc.invalidateQueries({ queryKey: ["oportunidades"] });
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo guardar.")),
  });

  return (
    <li
      onClick={() => {
        if (window.getSelection()?.toString()) return;
        navegar(`/oportunidades/${m.id}`);
      }}
      className={`p-4 space-y-3 rounded-lg border cursor-pointer ${
        ganada === "por_cumplir"
          ? "border-amber-300 bg-amber-50 hover:border-amber-500"
          : lista
            ? "border-green-300 bg-green-50 hover:border-green-500"
            : "border-gray-200 bg-white hover:border-blue-300"
      }`}
    >
      {/* El cierre o el servicio, siempre a la derecha aunque el nombre
          sea largo (Felipe, 28-10: "si siempre a la derecha"); en el
          teléfono baja bajo el nombre, que si no queda muy apretado. */}
      <div className="flex flex-wrap items-start justify-between gap-3 sm:flex-nowrap">
        <div className="min-w-0 sm:flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <SelloDeTipo tipo={p.tipo} />
            <Link
              to={`/oportunidades/${m.id}`}
              onClick={(e) => e.stopPropagation()}
              className="text-sm font-semibold text-gray-900 hover:text-blue-700"
            >
              {p.nombre}
            </Link>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">
            {[
              p.organismo,
              m.codigo,
              p.monto ? formatCurrency(p.monto, "CLP") : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {ganada ? (
          <ElServicio m={m} />
        ) : (
          <div className="text-right text-xs sm:shrink-0">
            <p className="text-gray-500">
              Cierra {formatMomento(p.fecha_cierre, "diaHora", "sin fecha")}
            </p>
            <p
              className={
                cierre.urgente ? "font-semibold text-red-600" : "text-gray-500"
              }
            >
              {cierre.texto}
            </p>
          </div>
        )}
      </div>

      {resultado && (
        <p className={`text-sm font-semibold ${colorDelResultado(resultado)}`}>
          {textoDelResultado(resultado)}
        </p>
      )}

      <div className="flex flex-wrap gap-1.5">
        {pasosDelAvance(m).map((x) => (
          <span
            key={x.paso}
            className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-semibold rounded ${ESTILO_DEL_PASO[x.estado]}`}
          >
            {x.estado === "hecho" && <Check size={12} />}
            {x.estado === "en_curso" && (
              <Loader2 size={12} className="animate-spin" />
            )}
            {x.paso === "Bases" && x.estado === "falta"
              ? "Faltan las bases"
              : x.paso}
          </span>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
        <div onClick={(e) => e.stopPropagation()}>
          <ChipDeEstado
            value={m.estado}
            opciones={ESTADOS}
            onChange={(v) => cambiar.mutate(v as EstadoOportunidad)}
            disabled={cambiar.isPending}
          />
        </div>
        <span>{responsable ? responsable.label : "Sin responsable"}</span>
      </div>
    </li>
  );
}

/** Decisión 100: cuándo es el servicio de una ganada, como lo dicen las
 *  bases, y el próximo día en palabras («hoy», en rojo). */
function ElServicio({ m }: { readonly m: MiLicitacion }) {
  const servicio = (m as ConServicio).servicio;
  const cuando = cuandoEsElServicio(servicio, hoyEnChile());
  return (
    <div className="max-w-[15rem] text-right text-xs sm:shrink-0">
      <p className="text-gray-500">Servicio</p>
      {cuando && (
        <p
          className={`font-semibold ${cuando.urgente ? "text-red-600" : "text-gray-700"}`}
        >
          {cuando.texto}, {formatFechaEvento(cuando.dia, "diaYMes")}
        </p>
      )}
      <p className="line-clamp-2 text-gray-500" title={servicio?.texto}>
        {servicio?.texto || "Sin fecha en las bases"}
      </p>
    </div>
  );
}
