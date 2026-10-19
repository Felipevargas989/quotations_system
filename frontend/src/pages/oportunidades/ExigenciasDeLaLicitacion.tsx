import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ListChecks, X } from "lucide-react";
import { useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import {
  type MarcaDeExigencia,
  marcarExigencia,
} from "../../services/exigencias.service";
import {
  actualizarOportunidad,
  type FichaDeOportunidad,
  type ResultadoDeBases,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { cuentaDeMarcas, exigenciasDe } from "./exigencias";
import { ESTILO_DE_CUMPLIMIENTO } from "./oportunidades.utils";

// LAS EXIGENCIAS DE LA LICITACIÓN (19-10, migración 152). Felipe: "un
// listado de exigencias... y marcar algunos que sean como lo tengo y otro
// hay que conseguir o revisar... y si marco uno que no puedo, bueno,
// desisto". La IA sugiere (con tu carta, tus instalaciones y tu agenda); tú
// marcas ✓ lo tengo o ✗ no puedo, y queda guardado.

const claveDeLaFicha = (id: number) => ["oportunidades", "ficha", id];

export default function ExigenciasDeLaLicitacion({
  oportunidadId,
  r,
  marcas,
  postulada,
}: {
  readonly oportunidadId: number;
  readonly r: Pick<ResultadoDeBases, "requisitos" | "cumplimiento">;
  readonly marcas: Record<string, MarcaDeExigencia>;
  /** Postulada o ganada: ya no se desiste. */
  readonly postulada: boolean;
}) {
  const qc = useQueryClient();
  const [desistiendo, setDesistiendo] = useState(false);
  const exigencias = exigenciasDe(r);

  const ponerMarcas = (nuevas: Record<string, MarcaDeExigencia>) =>
    qc.setQueryData<FichaDeOportunidad>(claveDeLaFicha(oportunidadId), (f) =>
      f ? { ...f, exigencias_marcadas: nuevas } : f,
    );
  // Las marcas van de a una, en orden (19-10: dos clics seguidos se
  // pisaban), y cada una se pone al tiro sobre lo último que hay en
  // pantalla, no sobre lo que había al pintar.
  const marcar = useMutation({
    mutationKey: ["oportunidades", "exigencias", oportunidadId],
    scope: { id: `exigencias-${oportunidadId}` },
    mutationFn: (m: { clave: string; marca: MarcaDeExigencia | null }) =>
      marcarExigencia(oportunidadId, m.clave, m.marca),
    onMutate: (m) => {
      const ultimas =
        qc.getQueryData<FichaDeOportunidad>(claveDeLaFicha(oportunidadId))
          ?.exigencias_marcadas ?? marcas;
      const nuevas = { ...ultimas };
      if (m.marca) nuevas[m.clave] = m.marca;
      else delete nuevas[m.clave];
      ponerMarcas(nuevas);
    },
    // Lo que guardó el motor, cuando ya no queda otra marca en camino.
    onSuccess: (todas) => {
      if (
        qc.isMutating({
          mutationKey: ["oportunidades", "exigencias", oportunidadId],
        }) <= 1
      ) {
        ponerMarcas(todas);
      }
    },
    onError: (e) => {
      void qc.invalidateQueries({ queryKey: claveDeLaFicha(oportunidadId) });
      toast.error(humanizeApiError(e, "No se pudo guardar la marca."));
    },
  });
  const desistir = useMutation({
    mutationFn: () =>
      actualizarOportunidad(oportunidadId, { estado: "descartada" }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: claveDeLaFicha(oportunidadId) });
      toast.success("Desististe de esta licitación: quedó en «Descartadas».");
      setDesistiendo(false);
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo desistir.")),
  });

  if (exigencias.length === 0) return null;
  const { loTengo, noPuedo, sinMarcar } = cuentaDeMarcas(exigencias, marcas);

  return (
    <div className="p-3 rounded-lg border border-gray-200 space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <ListChecks size={15} /> Exigencias de la licitación
        </h3>
        <p className="text-xs text-gray-500">
          {loTengo} lo tienes · {noPuedo.length} no puedes · {sinMarcar} por
          revisar
        </p>
      </div>
      <p className="text-xs text-gray-500">
        Lo que tienes que cumplir u ofrecer. La IA sugiere con tu carta, tus
        instalaciones y tu agenda; tú marcas.
      </p>

      {noPuedo.length > 0 && (
        <div className="p-3 rounded-lg border border-red-200 bg-red-50 space-y-2">
          <p className="text-sm text-red-800">
            Marcaste que no puedes cumplir:{" "}
            {noPuedo.map((e) => `«${e.que}»`).join(", ")}. Si es obligatoria, lo
            sano es desistir.
          </p>
          {!postulada &&
            (desistiendo ? (
              <ConfirmInline
                question="¿Desistes de esta licitación? Queda en «Descartadas» (se puede recuperar)."
                yesLabel="Sí, desistir"
                onYes={() => desistir.mutate()}
                onNo={() => setDesistiendo(false)}
                busy={desistir.isPending}
              />
            ) : (
              <button
                type="button"
                onClick={() => setDesistiendo(true)}
                className="px-3 py-1.5 text-sm font-semibold text-red-700 bg-white border border-red-200 rounded-lg hover:bg-red-100"
              >
                Desistir de esta licitación
              </button>
            ))}
        </div>
      )}

      <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
        {exigencias.map((e) => {
          const marca = marcas[e.clave];
          const estilo = e.ia ? ESTILO_DE_CUMPLIMIENTO[e.ia] : null;
          return (
            <li
              key={e.clave}
              className="px-3 py-2 flex flex-wrap items-start gap-3"
            >
              <div className="min-w-0 flex-1 space-y-0.5">
                <p className="text-sm text-gray-800">
                  {e.que}
                  {e.pagina ? (
                    <span className="text-xs text-gray-400">
                      {" "}
                      (pág. {e.pagina})
                    </span>
                  ) : null}
                </p>
                {estilo && (
                  <p className="text-xs text-gray-500">
                    <span
                      className={`mr-1.5 px-1.5 py-0.5 font-semibold rounded ${estilo.clases}`}
                    >
                      IA: {estilo.label}
                    </span>
                    {e.detalle}
                  </p>
                )}
              </div>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  aria-pressed={marca === "lo_tengo"}
                  onClick={() =>
                    marcar.mutate({
                      clave: e.clave,
                      marca: marca === "lo_tengo" ? null : "lo_tengo",
                    })
                  }
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border ${
                    marca === "lo_tengo"
                      ? "bg-green-600 border-green-600 text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-green-50"
                  }`}
                >
                  <Check size={12} /> Lo tengo
                </button>
                <button
                  type="button"
                  aria-pressed={marca === "no_puedo"}
                  onClick={() =>
                    marcar.mutate({
                      clave: e.clave,
                      marca: marca === "no_puedo" ? null : "no_puedo",
                    })
                  }
                  className={`inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border ${
                    marca === "no_puedo"
                      ? "bg-red-600 border-red-600 text-white"
                      : "bg-white border-gray-200 text-gray-600 hover:bg-red-50"
                  }`}
                >
                  <X size={12} /> No puedo
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
