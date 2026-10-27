import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { useState } from "react";
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
import { formatMomento } from "../../utils/dates";
import {
  cuandoCierra,
  ESTADOS,
  ESTILO_DEL_PASO,
  pasosDelAvance,
  separarMias,
} from "./oportunidades.utils";
import { type ConResultado, textoDelResultado } from "./resultadoDeCompraAgil";
import SelloDeTipo from "./SelloDeTipo";
import { useMisLicitaciones } from "./useMisLicitaciones";
import { useResponsables } from "./useResponsables";

// "MIS LICITACIONES" (Felipe, 17-10: "¿dónde van a quedar compiladas las
// que sí me interesan para luego trabajarlas?"). Las que marcaste «Me
// interesa», con el avance de cada una. Al pinchar una se abre su ficha,
// donde se trabaja. Desde el 19-10 en dos listas (Felipe: "ya postuladas
// abajo y de algún color diferente para saber que están listas"): por
// postular, por vencimiento, y las postuladas aparte, en verde.

export default function MisLicitaciones() {
  const { data: lista = [], isPending, isError } = useMisLicitaciones();
  const { porPostular, postuladas, terminadas } = separarMias(lista);
  const [verTerminadas, setVerTerminadas] = useState(false);

  if (isPending) {
    return <p className="py-10 text-center text-sm text-gray-500">Cargando…</p>;
  }
  if (isError) {
    return (
      <p className="py-10 text-center text-sm text-red-600">
        No se pudieron cargar tus licitaciones. Intenta de nuevo en un rato.
      </p>
    );
  }
  if (lista.length === 0) {
    return (
      <p className="py-10 text-center text-sm text-gray-500">
        Todavía no marcas ninguna. En la Bandeja, pincha una licitación y elige
        «Me interesa»: queda aquí para trabajarla.
      </p>
    );
  }
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Encabezado
          titulo={`Por postular (${porPostular.length})`}
          detalle="De la que vence antes a la que vence después."
        />
        {porPostular.length > 0 ? (
          <ul className="space-y-3">
            {porPostular.map((m) => (
              <Tarjeta key={m.id} m={m} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-gray-500">Nada por postular.</p>
        )}
      </div>
      {postuladas.length > 0 && (
        <div className="space-y-3">
          <Encabezado
            titulo={`Postuladas (${postuladas.length})`}
            detalle="Listas: ahora a esperar el resultado."
          />
          <ul className="space-y-3">
            {postuladas.map((m) => (
              <Tarjeta key={m.id} m={m} lista />
            ))}
          </ul>
        </div>
      )}
      {terminadas.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setVerTerminadas((v) => !v)}
            className="inline-flex items-center gap-1 text-sm font-semibold text-gray-600 hover:text-gray-900"
          >
            {verTerminadas ? (
              <ChevronDown size={16} />
            ) : (
              <ChevronRight size={16} />
            )}
            Ganadas y perdidas ({terminadas.length})
          </button>
          {verTerminadas && (
            <ul className="space-y-3">
              {terminadas.map((m) => (
                <Tarjeta key={m.id} m={m} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Encabezado({
  titulo,
  detalle,
}: {
  readonly titulo: string;
  readonly detalle: string;
}) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-900">{titulo}</h3>
      <p className="text-xs text-gray-500">{detalle}</p>
    </div>
  );
}

function Tarjeta({
  m,
  lista = false,
}: {
  readonly m: MiLicitacion;
  /** Postulada: lista, en verde. */
  readonly lista?: boolean;
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
        lista
          ? "border-green-300 bg-green-50 hover:border-green-500"
          : "border-gray-200 bg-white hover:border-blue-300"
      }`}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
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
        <div className="text-right text-xs">
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
      </div>

      {resultado && (
        <p
          className={`text-sm font-semibold ${
            resultado.estado === "ganada" ? "text-green-700" : "text-gray-700"
          }`}
        >
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
