import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PenLine, Trash2 } from "lucide-react";
import { useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import { useArrastreDeArchivos } from "../../hooks/useArrastreDeArchivos";
import {
  borrarFirma,
  subirFirma,
  type VistaDelOferente,
} from "../../services/oportunidades.service";
import { resolveStorageUrl } from "../../services/storage.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";

// LA FOTO DE LA FIRMA (doc 17, sprint 3, paso 2). Felipe, 17-10: "la
// firma (una foto de la firma)". Se usa para firmar los anexos que la IA
// llene, siempre después de que la persona los revise. Vive en el balde
// privado: se ve con un enlace firmado que caduca en minutos.

const MAX_MB_FIRMA = 2;

export default function FirmaDelOferente({
  ruta,
  subidaEn,
}: {
  readonly ruta: string | null;
  readonly subidaEn: string | null;
}) {
  const qc = useQueryClient();
  const [confirmar, setConfirmar] = useState(false);
  const { data: url } = useQuery({
    queryKey: ["oportunidades", "firma", ruta],
    queryFn: () => resolveStorageUrl(ruta!),
    enabled: Boolean(ruta),
    // El enlace firmado dura 5 minutos: se pide de nuevo antes.
    staleTime: 4 * 60 * 1000,
  });

  const alTerminar = (vista: VistaDelOferente) =>
    qc.setQueryData(["oportunidades", "oferente"], vista);

  const subir = useMutation({
    mutationFn: (archivo: File) => subirFirma(archivo),
    onSuccess: (vista) => {
      alTerminar(vista);
      toast.success("Firma guardada.");
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo subir la firma.")),
  });
  const borrar = useMutation({
    mutationFn: borrarFirma,
    onSuccess: (vista) => {
      alTerminar(vista);
      toast.success("Firma eliminada.");
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo eliminar.")),
    onSettled: () => setConfirmar(false),
  });

  const recibir = (archivos: File[]) => {
    const archivo = archivos[0];
    if (!archivo) return;
    if (!/\.(png|jpe?g|webp)$/i.test(archivo.name)) {
      toast.error("La firma va como imagen: PNG, JPG o WebP.");
      return;
    }
    if (archivo.size > MAX_MB_FIRMA * 1024 * 1024) {
      toast.error(`La imagen de la firma pesa más de ${MAX_MB_FIRMA} MB.`);
      return;
    }
    subir.mutate(archivo);
  };
  const { arrastrando, zona } = useArrastreDeArchivos(recibir, {
    desactivado: subir.isPending,
  });

  return (
    <section {...zona} className="bg-white rounded-lg shadow p-5 space-y-3">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <PenLine size={15} /> Firma
        </h2>
        <p className="text-xs text-gray-500">
          Una foto o escaneo de la firma del representante, sobre fondo blanco.
          Se pone solo en los anexos que tú revises antes de subirlos.
        </p>
      </div>

      <div
        className={`flex flex-wrap items-center gap-4 rounded-lg border-2 border-dashed p-4 transition-colors ${
          arrastrando ? "border-blue-400 bg-blue-50/60" : "border-gray-200"
        }`}
      >
        {ruta ? (
          <div className="flex h-24 w-56 items-center justify-center rounded border border-gray-200 bg-white">
            {url ? (
              <img
                src={url}
                alt="Firma guardada"
                className="max-h-20 max-w-[13rem] object-contain"
              />
            ) : (
              <span className="text-xs text-gray-400">Cargando…</span>
            )}
          </div>
        ) : (
          <p className="text-sm text-gray-500">
            {arrastrando ? "¡Suéltala aquí! ↓" : "Todavía no hay firma."}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 focus-within:ring-2 focus-within:ring-blue-500">
            {subir.isPending
              ? "Subiendo…"
              : ruta
                ? "Cambiar firma"
                : "Subir la foto de la firma"}
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              className="sr-only"
              disabled={subir.isPending}
              onChange={(e) => {
                const elegidos = Array.from(e.target.files ?? []);
                e.currentTarget.value = "";
                recibir(elegidos);
              }}
            />
          </label>
          {ruta &&
            (confirmar ? (
              <ConfirmInline
                question="¿Eliminar la firma?"
                onYes={() => borrar.mutate()}
                onNo={() => setConfirmar(false)}
                busy={borrar.isPending}
              />
            ) : (
              <button
                type="button"
                onClick={() => setConfirmar(true)}
                className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-red-500"
              >
                <Trash2 size={13} /> Eliminar
              </button>
            ))}
        </div>
        {ruta && subidaEn && (
          <p className="w-full text-xs text-gray-400">
            Subida el {formatMomento(subidaEn, "diaHora")}. PNG, JPG o WebP,
            hasta {MAX_MB_FIRMA} MB.
          </p>
        )}
      </div>
    </section>
  );
}
