import { useMutation, useQuery } from "@tanstack/react-query";
import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "../../components/toast/Toast";
import {
  descargarSetParaMercadoPublico,
  getSetParaMercadoPublico,
  type PiezaDelSet,
} from "../../services/postulacion.service";
import { humanizeApiError } from "../../utils/apiErrors";

// «DESCARGAR PARA MERCADO PÚBLICO» (decisión 34 del doc 17, sprint I,
// 19-10). Felipe: "al momento de generar el set de documentos que tengo que
// subir al mercado público, debería descargarse y adjuntarse estos mismos
// documentos". Un ZIP con una carpeta por cada parte del portal
// (administrativa, técnica y económica): los anexos (firmados, si se
// firmaron), la propuesta técnica, lo que piden las bases de «Mi empresa» y
// los respaldos de la experiencia declarada. Antes de bajarlo, lo que falta.
// Desde la decisión 38, una cuarta, «4. Otros», con lo general para
// contratar (e-RUT, patente, no quiebra, estatutos y vigencia).
//
// Desde la decisión 79 (26-10) va al final del paso 3, «Subir a Mercado
// Público», después de «Validar todo»: «Descargar el ZIP» baja de una, y
// «Ver qué lleva» muestra cada archivo en su carpeta y los avisos de antes
// de subir.

const QUE_ES: Record<PiezaDelSet["que_es"], string> = {
  formulario: "Anexo",
  propuesta: "Propuesta",
  subido: "Subido por ti",
  documento: "Mi empresa",
  respaldo: "Respaldo",
};

const megas = (bytes: number) =>
  `${(bytes / 1024 / 1024).toLocaleString("es-CL", { maximumFractionDigits: 1 })} MB`;

type Fila = PiezaDelSet & { subcarpeta: string };

export default function SetParaMercadoPublico({
  oportunidadId,
  codigo,
}: {
  readonly oportunidadId: number;
  readonly codigo: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const {
    data: set,
    isFetching,
    error,
    refetch,
  } = useQuery({
    queryKey: ["oportunidades", "set", oportunidadId],
    queryFn: () => getSetParaMercadoPublico(oportunidadId),
    enabled: abierto,
    staleTime: 0,
    retry: false,
  });
  const descargar = useMutation({
    mutationFn: () => descargarSetParaMercadoPublico(oportunidadId),
    onSuccess: (zip) => {
      const url = URL.createObjectURL(zip);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Postulación ${codigo}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo armar el ZIP.")),
  });

  // Por carpeta del ZIP; un anexo que va en dos partes sale en las dos.
  const porCarpeta = new Map<string, Fila[]>();
  for (const p of set?.piezas ?? []) {
    for (const donde of p.carpetas) {
      const [carpeta, ...resto] = donde.split("/");
      porCarpeta.set(carpeta, [
        ...(porCarpeta.get(carpeta) ?? []),
        { ...p, subcarpeta: resto.join("/") },
      ]);
    }
  }
  const carpetas = [...porCarpeta.keys()].sort((a, b) => a.localeCompare(b));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          type="button"
          onClick={() => descargar.mutate()}
          disabled={descargar.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:opacity-50"
        >
          {descargar.isPending ? (
            <Loader2 size={14} className="animate-spin" />
          ) : (
            <Download size={14} />
          )}
          {descargar.isPending ? "Armando el ZIP…" : "Descargar el ZIP"}
        </button>
        <span className="text-xs text-gray-500">
          Una carpeta por cada parte del portal (administrativa, técnica,
          económica y «4. Otros»), lista para subir.{" "}
          <button
            type="button"
            onClick={() => setAbierto((v) => !v)}
            aria-expanded={abierto}
            className="font-semibold text-blue-700 hover:text-blue-900"
          >
            {abierto ? "Ocultar qué lleva" : "Ver qué lleva"}
          </button>
        </span>
      </div>

      {abierto && isFetching && !set && (
        <p className="flex items-center gap-1.5 text-sm text-gray-500">
          <Loader2 size={14} className="animate-spin" /> Revisando lo que va…
        </p>
      )}
      {error && (
        <p className="text-sm text-red-700">
          {humanizeApiError(error, "No se pudo revisar qué va.")}
        </p>
      )}

      {set && (
        <div className="space-y-4">
          {set.faltan.length > 0 && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 space-y-1">
              <p className="text-sm font-semibold text-amber-900">
                Antes de subir ({set.faltan.length})
              </p>
              <ul className="list-disc pl-5 text-sm text-amber-900 space-y-0.5">
                {set.faltan.map((f) => (
                  <li key={f}>{f}</li>
                ))}
              </ul>
            </div>
          )}

          {carpetas.map((carpeta) => (
            <div key={carpeta} className="space-y-1">
              <h3 className="text-sm font-semibold text-gray-800">{carpeta}</h3>
              <ul className="divide-y divide-gray-100 border border-gray-200 rounded-lg">
                {(porCarpeta.get(carpeta) ?? []).map((p) => (
                  <li
                    key={`${p.subcarpeta}/${p.nombre}`}
                    className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-sm"
                  >
                    <span className="text-gray-900 break-all">
                      {p.subcarpeta && (
                        <span className="text-gray-400">{p.subcarpeta}/</span>
                      )}
                      {p.nombre}
                    </span>
                    <span className="flex items-center gap-2">
                      {p.aviso && (
                        <span className="text-xs font-semibold text-amber-700">
                          {p.aviso}
                        </span>
                      )}
                      <span className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600 whitespace-nowrap">
                        {QUE_ES[p.que_es]}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {set.piezas.length === 0 ? (
            <p className="text-sm text-gray-600">
              Todavía no hay nada que bajar: genera los anexos o sube a «Mi
              postulación» lo que vas a presentar.
            </p>
          ) : (
            <p className="text-xs text-gray-500">
              {set.piezas.length}{" "}
              {set.piezas.length === 1 ? "archivo" : "archivos"} ·{" "}
              {megas(set.bytes)} ·{" "}
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isFetching}
                className="font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-50"
              >
                {isFetching ? "Revisando…" : "Revisar de nuevo"}
              </button>
            </p>
          )}
        </div>
      )}
    </div>
  );
}
