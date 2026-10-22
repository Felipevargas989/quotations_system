import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, PenLine, Sparkles, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
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
import { limpiarArchivoDeFirma } from "./firmaEnCanvas";

// LA FOTO DE LA FIRMA (doc 17, sprint 3, paso 2). Felipe, 17-10: "la
// firma (una foto de la firma)". Se usa para firmar los anexos que la IA
// llene, siempre después de que la persona los revise. Vive en el balde
// privado: se ve con un enlace firmado que caduca en minutos.
//
// LIMPIA (decisión 50, 19-10; Felipe: "debe quedar solo las líneas,
// bonitas... y deben ser azul"): antes de subirla, el navegador deja solo
// el trazo, en azul, sin el papel y recortado (limpiarFirma.ts). Se ve
// cómo queda y recién ahí se guarda. La que ya estaba se puede limpiar igual.

/** La foto original puede ser grande (la del celular): lo que se sube es el
 *  PNG limpio, que pesa mucho menos. */
const MAX_MB_FOTO = 15;
const MAX_MB_FIRMA = 2;

type Propuesta = { archivo: File; vista: string };

export default function FirmaDelOferente({
  ruta,
  subidaEn,
}: {
  readonly ruta: string | null;
  readonly subidaEn: string | null;
}) {
  const qc = useQueryClient();
  const [confirmar, setConfirmar] = useState(false);
  const [limpiando, setLimpiando] = useState(false);
  const [propuesta, setPropuesta] = useState<Propuesta | null>(null);
  const { data: url } = useQuery({
    queryKey: ["oportunidades", "firma", ruta],
    queryFn: () => resolveStorageUrl(ruta!),
    enabled: Boolean(ruta),
    // El enlace firmado dura 5 minutos: se pide de nuevo antes.
    staleTime: 4 * 60 * 1000,
  });

  // La vista previa vive en memoria: se suelta al cambiarla o al salir.
  useEffect(
    () => () => {
      if (propuesta) URL.revokeObjectURL(propuesta.vista);
    },
    [propuesta],
  );

  const alTerminar = (vista: VistaDelOferente) =>
    qc.setQueryData(["oportunidades", "oferente"], vista);

  const subir = useMutation({
    mutationFn: (archivo: File) => subirFirma(archivo),
    onSuccess: (vista) => {
      alTerminar(vista);
      setPropuesta(null);
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

  const limpiar = async (foto: Blob) => {
    setLimpiando(true);
    try {
      const limpia = await limpiarArchivoDeFirma(foto);
      if (!limpia) {
        toast.error(
          "No encontré la firma en la foto: prueba con más luz y el papel blanco entero.",
        );
        return;
      }
      if (limpia.size > MAX_MB_FIRMA * 1024 * 1024) {
        toast.error(`La firma limpia pesa más de ${MAX_MB_FIRMA} MB.`);
        return;
      }
      setPropuesta({ archivo: limpia, vista: URL.createObjectURL(limpia) });
    } catch {
      toast.error("No se pudo leer la imagen de la firma.");
    } finally {
      setLimpiando(false);
    }
  };

  const recibir = (archivos: File[]) => {
    const archivo = archivos[0];
    if (!archivo) return;
    if (!/\.(png|jpe?g|webp)$/i.test(archivo.name)) {
      toast.error("La firma va como imagen: PNG, JPG o WebP.");
      return;
    }
    if (archivo.size > MAX_MB_FOTO * 1024 * 1024) {
      toast.error(`La foto de la firma pesa más de ${MAX_MB_FOTO} MB.`);
      return;
    }
    void limpiar(archivo);
  };
  const limpiarLaGuardada = async () => {
    if (!url) return;
    try {
      const respuesta = await fetch(url);
      if (!respuesta.ok) throw new Error(`HTTP ${respuesta.status}`);
      await limpiar(await respuesta.blob());
    } catch {
      toast.error("No se pudo bajar la firma guardada.");
    }
  };
  const ocupado = limpiando || subir.isPending;
  const { arrastrando, zona } = useArrastreDeArchivos(recibir, {
    desactivado: ocupado,
  });

  return (
    <section {...zona} className="bg-white rounded-lg shadow p-5 space-y-3">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <PenLine size={15} /> Firma
        </h2>
        <p className="text-xs text-gray-500">
          Una foto de la firma del representante, sobre papel blanco: Eventia
          deja solo el trazo, en azul y sin el fondo. Se pone solo en los anexos
          que tú revises antes de subirlos.
        </p>
      </div>

      {propuesta && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-3 space-y-2">
          <p className="text-xs font-semibold text-gray-700">
            Así va a quedar tu firma:
          </p>
          <div className="flex h-28 w-72 max-w-full items-center justify-center rounded border border-gray-200 bg-white">
            <img
              src={propuesta.vista}
              alt="Firma limpia"
              className="max-h-24 max-w-[17rem] object-contain"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => subir.mutate(propuesta.archivo)}
              disabled={subir.isPending}
              className="px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-50"
            >
              {subir.isPending ? "Guardando…" : "Guardar firma"}
            </button>
            <button
              type="button"
              onClick={() => setPropuesta(null)}
              disabled={subir.isPending}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-gray-600 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

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
            {limpiando
              ? "Limpiando la firma…"
              : ruta
                ? "Cambiar firma"
                : "Subir la foto de la firma"}
            <input
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              className="sr-only"
              disabled={ocupado}
              onChange={(e) => {
                const elegidos = Array.from(e.target.files ?? []);
                e.currentTarget.value = "";
                recibir(elegidos);
              }}
            />
          </label>
          {ruta && url && (
            <button
              type="button"
              onClick={() => void limpiarLaGuardada()}
              disabled={ocupado}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold text-blue-700 hover:bg-blue-50 disabled:opacity-50"
            >
              {limpiando ? (
                <Loader2
                  size={13}
                  className="animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Sparkles size={13} aria-hidden="true" />
              )}
              Limpiar la firma guardada
            </button>
          )}
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
            Subida el {formatMomento(subidaEn, "diaHora")}. Una foto en PNG, JPG
            o WebP, hasta {MAX_MB_FOTO} MB.
          </p>
        )}
      </div>
    </section>
  );
}
