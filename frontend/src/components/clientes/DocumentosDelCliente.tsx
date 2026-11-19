import { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Plus, Trash2 } from "lucide-react";
import ConfirmInline from "../ConfirmInline";
import FileViewLink from "../FileViewLink";
import TituloDeSeccion from "../grilla/TituloDeSeccion";
import { toast } from "../toast/Toast";
import { useArrastreDeArchivos } from "../../hooks/useArrastreDeArchivos";
import { uploadClientDocument } from "../../services/storage.service";
import {
  agregarDocumentoDelCliente,
  borrarDocumentoDelCliente,
  fechaCl,
  getDocumentosDelCliente,
} from "../../services/convenios.service";
import { humanizeApiError } from "../../utils/apiErrors";

// DOCUMENTOS DEL CLIENTE (doc 24, 19-11-2026).
//
// Felipe: «hay documentos que son como del cliente». Igual en trato que los
// adjuntos de la cotización, pero colgando del cliente. El convenio firmado
// llega aquí solo (en línea o subido en papel) y no se borra desde la lista.

export default function DocumentosDelCliente({
  clientId,
  puedeEditar,
}: {
  readonly clientId: string;
  readonly puedeEditar: boolean;
}) {
  const qc = useQueryClient();
  const { data: documentos = [], isError } = useQuery({
    queryKey: ["documentosDelCliente", clientId],
    queryFn: () => getDocumentosDelCliente(clientId),
    retry: false,
  });
  const [subiendo, setSubiendo] = useState(false);
  const [borrando, setBorrando] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const entrada = useRef<HTMLInputElement>(null);

  const refrescar = () =>
    qc.invalidateQueries({ queryKey: ["documentosDelCliente", clientId] });

  const subir = async (archivos: File[]) => {
    if (!puedeEditar || !archivos.length) return;
    setSubiendo(true);
    try {
      for (const archivo of archivos) {
        const r = await uploadClientDocument(archivo, clientId);
        if (!r.success || !r.url) {
          toast.error(r.error || `No se pudo subir ${archivo.name}`);
          continue;
        }
        await agregarDocumentoDelCliente(clientId, {
          file_url: r.url,
          file_name: archivo.name,
        });
      }
      refrescar();
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo agregar el documento"));
    } finally {
      setSubiendo(false);
      if (entrada.current) entrada.current.value = "";
    }
  };

  const { arrastrando, zona } = useArrastreDeArchivos(subir, {
    desactivado: !puedeEditar,
  });

  const borrar = async (id: number) => {
    setOcupado(true);
    try {
      await borrarDocumentoDelCliente(clientId, id);
      setBorrando(null);
      refrescar();
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo borrar el documento"));
    } finally {
      setOcupado(false);
    }
  };

  if (isError) return null;

  return (
    <div
      {...zona}
      className={`bg-white rounded-lg shadow p-6 space-y-3 ${
        arrastrando ? "ring-2 ring-blue-400" : ""
      }`}
    >
      <TituloDeSeccion
        titulo="Documentos del cliente"
        color="azul"
        accion={
          puedeEditar ? (
            <button
              type="button"
              disabled={subiendo}
              onClick={() => entrada.current?.click()}
              className="inline-flex items-center gap-1 text-xs font-semibold text-blue-700 hover:text-blue-900 disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" />
              {subiendo ? "Subiendo…" : "Agregar documento"}
            </button>
          ) : undefined
        }
      />
      <input
        ref={entrada}
        type="file"
        multiple
        accept="application/pdf,image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => subir(Array.from(e.target.files ?? []))}
      />

      {documentos.length === 0 ? (
        <p className="text-sm text-gray-500">
          {puedeEditar
            ? "Sin documentos. Puedes soltar aquí un PDF o una imagen."
            : "Sin documentos."}
        </p>
      ) : (
        <ul className="divide-y divide-gray-100">
          {documentos.map((d) => (
            <li key={d.id} className="flex items-center gap-2 py-2">
              <FileText
                className={`w-4 h-4 shrink-0 ${
                  d.categoria === "convenio"
                    ? "text-emerald-600"
                    : "text-blue-600"
                }`}
              />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate text-sm text-gray-900"
                  title={d.file_name}
                >
                  {d.file_name}
                </p>
                <p className="text-xs text-gray-500">
                  {fechaCl(d.uploaded_at)}
                  {d.categoria === "convenio" && (
                    <span className="ml-1 font-semibold text-emerald-700">
                      · Convenio
                    </span>
                  )}
                </p>
              </div>
              {borrando === d.id ? (
                <ConfirmInline
                  question="¿Borrar?"
                  yesLabel="Sí, borrar"
                  busy={ocupado}
                  onYes={() => borrar(d.id)}
                  onNo={() => setBorrando(null)}
                />
              ) : (
                <>
                  <FileViewLink url={d.file_url} title={d.file_name} />
                  {puedeEditar && d.categoria !== "convenio" && (
                    <button
                      type="button"
                      onClick={() => setBorrando(d.id)}
                      title="Borrar"
                      className="p-1 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
