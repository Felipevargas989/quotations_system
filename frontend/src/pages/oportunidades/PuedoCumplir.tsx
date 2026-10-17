import { ChevronDown, ChevronRight, ListChecks } from "lucide-react";
import { useState } from "react";
import type { ResultadoDeBases } from "../../services/oportunidades.service";
import { formatMomento } from "../../utils/dates";
import {
  ESTILO_DE_CUMPLIMIENTO,
  separarCumplimiento,
} from "./oportunidades.utils";

// "¿PUEDO CUMPLIR?" (Felipe, 17-10: "¿qué pasa si lo que están pidiendo no
// está en Eventia?"). Cada exigencia técnica de las bases contra lo que la
// empresa tiene en Eventia: su carta, sus instalaciones y su agenda de ese
// día. Arriba lo que impide o hay que conseguir; lo que ya tienes, plegado.
// "No se puede" solo sale con un dato duro, y siempre dice por qué.

export default function PuedoCumplir({
  r,
}: {
  readonly r: Pick<
    ResultadoDeBases,
    "cumplimiento" | "cumplimiento_error" | "requisitos"
  >;
}) {
  const [verLosQueTienes, setVerLosQueTienes] = useState(false);
  const hayTecnicos = r.requisitos.some((q) => q.tipo === "tecnico");
  if (!hayTecnicos) return null;

  const c = r.cumplimiento;
  if (!c) {
    return (
      <div className="p-3 rounded-lg border border-gray-200 space-y-1">
        <Titulo />
        <p className="text-sm text-gray-500">
          {r.cumplimiento_error ??
            "Vuelve a analizar para revisar si puedes cumplir con lo que tienes en Eventia."}
        </p>
      </div>
    );
  }

  const { porResolver, loTienes } = separarCumplimiento(c.items);
  return (
    <div className="p-3 rounded-lg border border-gray-200 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Titulo />
        <div className="flex flex-wrap gap-1.5">
          {(["no_se_puede", "conseguir", "tengo"] as const).map((e) => {
            const n = c.items.filter((i) => i.estado === e).length;
            if (n === 0) return null;
            return (
              <span
                key={e}
                className={`px-2 py-0.5 text-xs font-semibold rounded ${ESTILO_DE_CUMPLIMIENTO[e].clases}`}
              >
                {n} {ESTILO_DE_CUMPLIMIENTO[e].plural}
              </span>
            );
          })}
        </div>
      </div>
      {c.resumen && <p className="text-sm text-gray-700">{c.resumen}</p>}

      {porResolver.length > 0 && <Lista items={porResolver} />}

      {loTienes.length > 0 && (
        <div className="space-y-1.5">
          <button
            type="button"
            onClick={() => setVerLosQueTienes((v) => !v)}
            aria-expanded={verLosQueTienes}
            className="inline-flex items-center gap-1 text-xs font-semibold text-gray-600 hover:text-gray-900"
          >
            {verLosQueTienes ? (
              <ChevronDown size={14} />
            ) : (
              <ChevronRight size={14} />
            )}
            {loTienes.length === 1
              ? "La que ya tienes"
              : `Las ${loTienes.length} que ya tienes`}
          </button>
          {verLosQueTienes && <Lista items={loTienes} />}
        </div>
      )}

      <p className="text-xs text-gray-400">
        Comparado con tu carta, tus instalaciones (en «Mi empresa»)
        {c.agenda_de
          ? ` y tu agenda del ${formatMomento(`${c.agenda_de}T12:00:00Z`, "diaYMes")}`
          : ""}
        . La IA propone; la decisión es tuya.
      </p>
    </div>
  );
}

function Titulo() {
  return (
    <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
      <ListChecks size={15} /> ¿Puedo cumplir?
    </h3>
  );
}

function Lista({
  items,
}: {
  readonly items: NonNullable<ResultadoDeBases["cumplimiento"]>["items"];
}) {
  return (
    <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
      {items.map((i) => {
        const estilo = ESTILO_DE_CUMPLIMIENTO[i.estado];
        return (
          <li key={i.requisito} className="px-3 py-2 flex gap-3">
            <span
              className={`shrink-0 mt-0.5 h-fit min-w-[5.5rem] px-2 py-0.5 text-center text-xs font-semibold rounded ${estilo.clases}`}
            >
              {estilo.label}
            </span>
            <div className="min-w-0">
              <p className="text-sm text-gray-800">{i.que}</p>
              {(i.con_que || i.por_que) && (
                <p className="text-xs text-gray-500">
                  {i.con_que ? `Con: ${i.con_que}` : i.por_que}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
