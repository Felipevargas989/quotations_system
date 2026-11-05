import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import ConfirmInline from "../../components/ConfirmInline";
import FileViewLink from "../../components/FileViewLink";
import RutInput from "../../components/inputs/RutInput";
import NumberInput from "../../components/inputs/NumberInput";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import {
  OrdenDeCompra,
  createOrdenDeCompra,
  deleteOrdenDeCompra,
  getOrdenesDeCompra,
  updateOrdenDeCompra,
} from "../../services/ordenesDeCompra.service";
import { getRazonesSociales } from "../../services/razonesSociales.service";
import type { EventDocument } from "../../services/documents.service";
import { formatearRut } from "../../utils/rut";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  BorradorDeOC,
  borradorDeOC,
  cambiosDeOC,
  faltaEnLaOC,
  fechaCorta,
} from "../../utils/ordenesDeCompra";
import { docsQueryOpts } from "./consultaDeDocumentos";

// PESTAÑA «FACTURACIÓN» DEL EVENTO (doc 19, paso 2a): las órdenes de compra.
//
// Cada OC con su N°, fecha, a nombre de quién viene, montos, detalle y su
// PDF de Documentos. El N° va tal cual en la referencia 801 de la factura
// (hasta 18 caracteres). A nombre de quién viene es a quién se factura esa
// OC: Santo Tomás manda OC del CFT y del Instituto Profesional para un
// mismo evento (§9.12). En el paso 2b las llena BelIA leyendo el PDF, y en
// el 2c sale de acá la factura de cada una.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const OTRA = "otra";

const claseCasilla =
  "w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";

function Formulario({
  inicial,
  razones,
  pdfs,
  guardando,
  onGuardar,
  onCancelar,
}: {
  inicial: BorradorDeOC;
  razones: { rut: string; razon_social: string }[];
  pdfs: EventDocument[];
  guardando: boolean;
  onGuardar: (borrador: BorradorDeOC) => void;
  onCancelar: () => void;
}) {
  const [b, setB] = useState(inicial);
  const poner = <K extends keyof BorradorDeOC>(k: K, v: BorradorDeOC[K]) =>
    setB((prev) => ({ ...prev, [k]: v }));
  const conocida = razones.some((r) => r.rut === b.rut);
  const [otra, setOtra] = useState(!!b.rut && !conocida);
  const falta = faltaEnLaOC(b);

  return (
    <div className="space-y-3 rounded-lg border border-blue-100 bg-blue-50/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="flex justify-between text-xs text-gray-500">
            N° de la OC
            <span>{b.numero.length}/18</span>
          </span>
          <input
            type="text"
            value={b.numero}
            maxLength={18}
            onChange={(e) => poner("numero", e.target.value)}
            className={claseCasilla}
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Fecha de la OC</span>
          <input
            type="date"
            value={b.fecha}
            onChange={(e) => poner("fecha", e.target.value)}
            className={claseCasilla}
          />
        </label>
      </div>

      <div>
        <span className="text-xs text-gray-500">A nombre de</span>
        {razones.length > 0 && (
          <SelectWithSearch
            options={[
              ...razones.map((r) => ({
                value: r.rut,
                label: r.razon_social,
                hint: formatearRut(r.rut),
              })),
              { value: OTRA, label: "Otra razón social…" },
            ]}
            value={otra ? OTRA : conocida ? b.rut : ""}
            onChange={(v) => {
              if (v === OTRA || !v) {
                setOtra(v === OTRA);
                poner("rut", "");
                poner("razon_social", "");
                return;
              }
              const r = razones.find((x) => x.rut === v);
              setOtra(false);
              poner("rut", v);
              poner("razon_social", r?.razon_social ?? "");
            }}
            placeholder="Elegir la razón social"
            tamano="sm"
          />
        )}
        {(otra || razones.length === 0) && (
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            <RutInput
              value={b.rut}
              onChange={(rut) => poner("rut", rut)}
              placeholder="RUT de quien emite la OC"
              className="text-sm"
            />
            <input
              type="text"
              value={b.razon_social}
              maxLength={100}
              placeholder="Razón social"
              onChange={(e) => poner("razon_social", e.target.value)}
              className={claseCasilla}
            />
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="text-xs text-gray-500">Total con IVA</span>
          <NumberInput
            value={b.total}
            min={0}
            currency
            placeholder="0"
            onChange={(v) => poner("total", v)}
            className="px-3 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">Neto (si lo trae)</span>
          <NumberInput
            value={b.neto}
            min={0}
            currency
            placeholder="0"
            onChange={(v) => poner("neto", v)}
            className="px-3 py-1.5 text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs text-gray-500">IVA (si lo trae)</span>
          <NumberInput
            value={b.iva}
            min={0}
            currency
            placeholder="0"
            onChange={(v) => poner("iva", v)}
            className="px-3 py-1.5 text-sm"
          />
        </label>
      </div>

      <label className="block">
        <span className="flex justify-between text-xs text-gray-500">
          Detalle
          <span>{b.descripcion.length}/1000</span>
        </span>
        <textarea
          value={b.descripcion}
          maxLength={1000}
          rows={2}
          onChange={(e) => poner("descripcion", e.target.value)}
          className={claseCasilla}
        />
      </label>

      <div>
        <span className="text-xs text-gray-500">
          PDF de la OC (en Documentos)
        </span>
        <SelectWithSearch
          options={pdfs.map((d) => ({
            value: String(d.id),
            label: d.file_name,
            hint: fechaCorta(d.uploaded_at.slice(0, 10)),
          }))}
          value={b.documento_id}
          onChange={(v) => poner("documento_id", v || "")}
          placeholder={
            pdfs.length
              ? "Elegir el PDF"
              : "Sin órdenes de compra en Documentos"
          }
          disabled={pdfs.length === 0}
          tamano="sm"
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={guardando || falta.length > 0}
          onClick={() => onGuardar(b)}
          title={falta.length ? `Falta ${falta.join(", ")}` : undefined}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button
          type="button"
          onClick={onCancelar}
          className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg font-semibold hover:bg-gray-200"
        >
          Cancelar
        </button>
        {falta.length > 0 && (
          <span className="text-xs text-gray-500">
            Falta {falta.join(", ")}
          </span>
        )}
      </div>
    </div>
  );
}

function Fila({ oc, pdf }: { oc: OrdenDeCompra; pdf?: EventDocument }) {
  return (
    <div className="space-y-0.5 text-sm min-w-0">
      <p className="font-semibold text-gray-900">
        N° {oc.numero}
        <span className="font-normal text-gray-500">
          {" "}
          · {fechaCorta(oc.fecha)}
        </span>
      </p>
      {(oc.razon_social || oc.rut) && (
        <p className="text-gray-700 break-words">
          {oc.razon_social}
          {oc.rut ? ` · RUT ${formatearRut(oc.rut)}` : ""}
        </p>
      )}
      <p className="text-gray-900">
        {clp(oc.total)}
        {oc.neto != null && oc.iva != null && (
          <span className="text-gray-500">
            {" "}
            (neto {clp(oc.neto)} + IVA {clp(oc.iva)})
          </span>
        )}
      </p>
      {oc.descripcion && (
        <p className="text-gray-600 break-words whitespace-pre-line">
          {oc.descripcion}
        </p>
      )}
      {pdf && <FileViewLink url={pdf.file_url} title={pdf.file_name} />}
    </div>
  );
}

export default function FacturacionTab({
  quotationId,
  clientId,
}: {
  readonly quotationId: string;
  readonly clientId: string | null;
}) {
  const queryClient = useQueryClient();
  const llave = ["facturacion", "ordenes", quotationId];
  const ordenes = useQuery({
    queryKey: llave,
    queryFn: () => getOrdenesDeCompra(quotationId),
  });
  const docs = useQuery(docsQueryOpts(quotationId));
  const razones = useQuery({
    queryKey: ["razonesSociales", clientId],
    queryFn: () => getRazonesSociales(clientId as string),
    enabled: !!clientId,
  });

  const [editando, setEditando] = useState<number | "nueva" | null>(null);
  const [borrandoId, setBorrandoId] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);

  const pdfs = (docs.data ?? []).filter((d) => d.category === "ordenes_compra");
  const pdfDe = (oc: OrdenDeCompra) =>
    (docs.data ?? []).find((d) => d.id === oc.documento_id);
  const lista = ordenes.data ?? [];

  const guardar = async (antes: OrdenDeCompra | null, b: BorradorDeOC) => {
    const cambios = cambiosDeOC(antes, b);
    if (Object.keys(cambios).length === 0) {
      setEditando(null);
      return;
    }
    setGuardando(true);
    try {
      if (antes) await updateOrdenDeCompra(quotationId, antes.id, cambios);
      else await createOrdenDeCompra(quotationId, cambios);
      await queryClient.invalidateQueries({ queryKey: llave });
      toast.success("Orden de compra guardada.");
      setEditando(null);
    } catch (error) {
      toast.error(
        humanizeApiError(error, "No se pudo guardar la orden de compra."),
      );
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (id: number) => {
    try {
      await deleteOrdenDeCompra(quotationId, id);
      await queryClient.invalidateQueries({ queryKey: llave });
      toast.success("Orden de compra quitada.");
    } catch (error) {
      toast.error(humanizeApiError(error, "No se pudo quitar."));
    } finally {
      setBorrandoId(null);
    }
  };

  const formulario = (antes: OrdenDeCompra | null) => (
    <Formulario
      key={antes?.id ?? "nueva"}
      inicial={borradorDeOC(antes)}
      razones={razones.data ?? []}
      pdfs={pdfs}
      guardando={guardando}
      onGuardar={(b) => guardar(antes, b)}
      onCancelar={() => setEditando(null)}
    />
  );

  return (
    <div className="max-w-3xl space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">
            Órdenes de compra
          </h3>
          {editando === null && (
            <button
              type="button"
              onClick={() => setEditando("nueva")}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              <Plus size={13} /> Agregar OC
            </button>
          )}
        </div>

        {ordenes.isPending ? (
          <p className="text-sm text-gray-400">Cargando…</p>
        ) : ordenes.isError ? (
          <p className="text-sm text-red-600">
            No se pudieron cargar las órdenes de compra.
          </p>
        ) : lista.length === 0 && editando !== "nueva" ? (
          <p className="text-sm text-gray-500">Sin órdenes de compra.</p>
        ) : null}

        {lista.map((oc) =>
          editando === oc.id ? (
            formulario(oc)
          ) : borrandoId === oc.id ? (
            <ConfirmInline
              key={oc.id}
              question={`¿Quitar la OC N° ${oc.numero}?`}
              onYes={() => quitar(oc.id)}
              onNo={() => setBorrandoId(null)}
            />
          ) : (
            <div
              key={oc.id}
              className="flex items-start justify-between gap-3 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0"
            >
              <Fila oc={oc} pdf={pdfDe(oc)} />
              {editando === null && (
                <div className="flex shrink-0 gap-2 text-gray-400">
                  <button
                    type="button"
                    onClick={() => setEditando(oc.id)}
                    className="hover:text-blue-600"
                    title="Editar"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setBorrandoId(oc.id)}
                    className="hover:text-red-600"
                    title="Quitar"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </div>
          ),
        )}

        {editando === "nueva" && formulario(null)}
      </div>
    </div>
  );
}
