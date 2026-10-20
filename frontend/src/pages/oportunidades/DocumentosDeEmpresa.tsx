import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, FolderOpen, Trash2 } from "lucide-react";
import { useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import FileViewLink from "../../components/FileViewLink";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { toast } from "../../components/toast/Toast";
import { useArrastreDeArchivos } from "../../hooks/useArrastreDeArchivos";
import {
  borrarDocumentoDeEmpresa,
  subirDocumentoDeEmpresa,
  type DocumentoDeEmpresa,
} from "../../services/oportunidades.service";
import { marcarNoUsar } from "../../services/postulacion.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { hoyEnChile } from "../../utils/dates";
import { descargarDelBalde } from "./descargas";
import {
  estadoDeVencimiento,
  etiquetaDeDocumento,
  seVeEnElVisor,
  tamanoLegible,
  TIPOS_DE_DOCUMENTO,
} from "./oportunidades.utils";
import { resumenDelRespaldo, TIPO_RESPALDO } from "./respaldos";
import RespaldosEnLote from "./RespaldosEnLote";

// LA CARPETA DE DOCUMENTOS DE LA EMPRESA (doc 17 §5.5, sprint 3, paso 2):
// lo que piden casi todas las bases (patente, inicio de actividades,
// programa de integridad, F30...), con su fecha de vencimiento. Lo que
// vence en 30 días o ya venció se marca aquí y arriba de la pestaña: es el
// aviso, sin correo (decisión 17). Validar documentos (paso 3) la usa para
// saber qué está vigente.
//
// Desde el 19-10 también guarda los RESPALDOS DE EXPERIENCIA (decisión 34):
// la orden de compra o la factura de cada evento que se declara, con sus
// datos para el anexo de experiencia. No vencen. Se suben varios a la vez y
// se leen solos (RespaldosEnLote). Los que están en Post-venta no se suben
// aquí: «Armar postulación» los busca sola (decisión 45). Desde el 20-10
// (decisión 56, en vez de «las 10 de siempre»), la IA los usa de mayor a
// menor monto hasta cumplir lo que piden las bases, con 2 de reserva, y la
// empresa marca «No usar» los que no quiere mostrar. Felipe: "es más fácil
// la mantención... si solo marco lo que no quiero mostrar".

const TONOS = {
  ok: "bg-green-50 text-green-700",
  pronto: "bg-amber-100 text-amber-800",
  vencido: "bg-red-50 text-red-700",
  sin: "bg-gray-100 text-gray-600",
} as const;

const MAX_MB_DOCUMENTO = 15;

export default function DocumentosDeEmpresa({
  documentos,
}: {
  readonly documentos: DocumentoDeEmpresa[];
}) {
  const qc = useQueryClient();
  const hoy = hoyEnChile();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [tipo, setTipo] = useState("");
  const [vence, setVence] = useState("");
  const esRespaldo = tipo === TIPO_RESPALDO;
  const [porBorrar, setPorBorrar] = useState<number | null>(null);

  const recargar = () =>
    qc.invalidateQueries({ queryKey: ["oportunidades", "oferente"] });

  const subir = useMutation({
    mutationFn: () => subirDocumentoDeEmpresa(archivo!, tipo, vence),
    onSuccess: () => {
      toast.success("Documento guardado.");
      setArchivo(null);
      setTipo("");
      setVence("");
      void recargar();
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo subir el documento.")),
  });
  const noUsar = useMutation({
    mutationFn: ({ id, marcar }: { id: number; marcar: boolean }) =>
      marcarNoUsar(id, marcar),
    onSuccess: () => void recargar(),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo marcar el respaldo.")),
  });
  const hayRespaldos = documentos.some((d) => d.tipo === TIPO_RESPALDO);

  const borrar = useMutation({
    mutationFn: (id: number) => borrarDocumentoDeEmpresa(id),
    onSuccess: () => {
      toast.success("Documento eliminado.");
      void recargar();
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo eliminar.")),
    onSettled: () => setPorBorrar(null),
  });

  const recibir = (archivos: File[]) => {
    const a = archivos[0];
    if (!a) return;
    if (!/\.(pdf|jpe?g|png|webp|docx?)$/i.test(a.name)) {
      toast.error(
        `"${a.name}" no se puede subir: sirven PDF, Word e imágenes.`,
      );
      return;
    }
    if (a.size > MAX_MB_DOCUMENTO * 1024 * 1024) {
      toast.error(`"${a.name}" pesa más de ${MAX_MB_DOCUMENTO} MB.`);
      return;
    }
    setArchivo(a);
  };
  // Con «Respaldo de experiencia», los archivos los recibe RespaldosEnLote.
  const { arrastrando, zona } = useArrastreDeArchivos(recibir, {
    desactivado: subir.isPending || esRespaldo,
  });

  const descargar = async (d: DocumentoDeEmpresa) => {
    try {
      await descargarDelBalde(d.ruta, d.nombre);
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo descargar."));
    }
  };

  return (
    <section {...zona} className="bg-white rounded-lg shadow p-5 space-y-3">
      <div className="space-y-0.5">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          <FolderOpen size={15} /> Documentos de la empresa
        </h2>
        <p className="text-xs text-gray-500">
          Lo que piden casi todas las bases, con su vencimiento. Lo que vence en
          30 días o ya venció queda marcado.
        </p>
        {hayRespaldos && (
          <p className="text-xs text-gray-600">
            Los respaldos de experiencia se usan de mayor a menor monto, hasta
            cumplir lo que piden las bases y 2 de reserva. Con el ojo apagas los
            que no quieres mostrar.
          </p>
        )}
      </div>

      {documentos.length > 0 && (
        <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200">
          {documentos.map((d) => {
            const estado = estadoDeVencimiento(d.vence, hoy);
            return (
              <li
                key={d.id}
                className="px-3 py-2 flex flex-wrap items-center gap-3"
              >
                {/* Apagado como un servicio inactivo del catálogo: la fila
                    más clara y el ojo tachado; el «No se usa», en rojo. */}
                <div
                  className={`min-w-0 flex-1 ${d.datos?.no_usar ? "opacity-60" : ""}`}
                >
                  <p className="text-sm font-semibold text-gray-900">
                    {etiquetaDeDocumento(d.tipo)}
                  </p>
                  <p
                    className="text-xs text-gray-500 truncate"
                    title={d.nombre}
                  >
                    {d.nombre} · {tamanoLegible(d.bytes)}
                    {d.quien?.full_name ? ` · ${d.quien.full_name}` : ""}
                  </p>
                  {d.tipo === TIPO_RESPALDO && d.datos && (
                    <p className="text-xs text-gray-700 truncate">
                      {resumenDelRespaldo(d.datos)}
                    </p>
                  )}
                </div>
                {d.datos?.no_usar ? (
                  <span className="px-2 py-0.5 text-xs font-semibold rounded bg-red-50 text-red-700">
                    No se usa
                  </span>
                ) : (
                  <span
                    className={`px-2 py-0.5 text-xs font-semibold rounded ${TONOS[estado.tono]}`}
                  >
                    {estado.texto}
                  </span>
                )}
                <div className="flex items-center gap-3 shrink-0">
                  {d.tipo === TIPO_RESPALDO && (
                    <button
                      type="button"
                      onClick={() =>
                        noUsar.mutate({
                          id: d.id,
                          marcar: !d.datos?.no_usar,
                        })
                      }
                      disabled={noUsar.isPending}
                      title={d.datos?.no_usar ? "Volver a usar" : "No usar"}
                      aria-label={
                        d.datos?.no_usar
                          ? `Volver a usar ${d.nombre}`
                          : `No usar ${d.nombre}`
                      }
                      aria-pressed={Boolean(d.datos?.no_usar)}
                      className="text-gray-400 hover:text-gray-700 disabled:opacity-50"
                    >
                      {d.datos?.no_usar ? (
                        <EyeOff size={16} />
                      ) : (
                        <Eye size={16} />
                      )}
                    </button>
                  )}
                  {seVeEnElVisor(d.ruta) ? (
                    <FileViewLink url={d.ruta} title={d.nombre} />
                  ) : (
                    <button
                      type="button"
                      onClick={() => void descargar(d)}
                      className="text-sm font-semibold text-blue-600 hover:text-blue-800"
                    >
                      Descargar
                    </button>
                  )}
                  {porBorrar === d.id ? (
                    <ConfirmInline
                      question="¿Eliminar?"
                      onYes={() => borrar.mutate(d.id)}
                      onNo={() => setPorBorrar(null)}
                      busy={borrar.isPending}
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPorBorrar(d.id)}
                      className="text-gray-300 hover:text-red-500"
                      title="Eliminar documento"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div
        className={`rounded-lg border-2 border-dashed p-4 space-y-3 transition-colors ${
          arrastrando ? "border-blue-400 bg-blue-50/60" : "border-gray-200"
        }`}
      >
        {!esRespaldo && (
          <div className="flex flex-wrap items-center gap-2.5">
            <label className="cursor-pointer px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 focus-within:ring-2 focus-within:ring-blue-500">
              Elegir archivo
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.doc,.docx"
                className="sr-only"
                onChange={(e) => {
                  const elegidos = Array.from(e.target.files ?? []);
                  e.currentTarget.value = "";
                  recibir(elegidos);
                }}
              />
            </label>
            <span
              className={
                arrastrando
                  ? "text-xs font-bold text-blue-600"
                  : "text-xs text-gray-500"
              }
            >
              {arrastrando
                ? "¡Suéltalo aquí! ↓"
                : archivo
                  ? archivo.name
                  : "o arrástralo aquí · PDF, Word o imagen"}
            </span>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem_auto] sm:items-end">
          <div>
            <p className="text-xs text-gray-500 mb-1">Qué documento es</p>
            <SelectWithSearch
              options={TIPOS_DE_DOCUMENTO.map((t) => ({
                value: t.value,
                label: t.label,
              }))}
              value={tipo}
              onChange={(v) => setTipo(v)}
              placeholder="Elige el tipo"
              mostrarConteo={false}
              tamano="sm"
            />
          </div>
          {!esRespaldo && (
            <>
              <div>
                <p className="text-xs text-gray-500 mb-1">
                  Vence (vacío si no vence)
                </p>
                <input
                  type="date"
                  value={vence}
                  onChange={(e) => setVence(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="button"
                onClick={() => subir.mutate()}
                disabled={!archivo || !tipo || subir.isPending}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {subir.isPending ? "Subiendo…" : "Guardar documento"}
              </button>
            </>
          )}
        </div>
        {esRespaldo && <RespaldosEnLote alGuardar={() => void recargar()} />}
      </div>
    </section>
  );
}
