import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { toast } from "../../components/toast/Toast";
import ConfirmInline from "../../components/ConfirmInline";
import FileViewLink from "../../components/FileViewLink";
import RutInput from "../../components/inputs/RutInput";
import NumberInput from "../../components/inputs/NumberInput";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import {
  LecturaDeOC,
  OrdenDeCompra,
  createOrdenDeCompra,
  deleteOrdenDeCompra,
  getOrdenesDeCompra,
  leerOrdenDeCompra,
  updateOrdenDeCompra,
} from "../../services/ordenesDeCompra.service";
import { getRazonesSociales } from "../../services/razonesSociales.service";
import { getDocumentosTributarios } from "../../services/facturas.service";
import type { EventDocument } from "../../services/documents.service";
import { formatearRut } from "../../utils/rut";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  BorradorDeOC,
  borradorDeLaLectura,
  borradorDeOC,
  cambiosDeOC,
  faltaEnLaOC,
  fechaCorta,
} from "../../utils/ordenesDeCompra";
import { docsQueryOpts } from "./consultaDeDocumentos";
import ArmarFactura from "./facturacion/ArmarFactura";
import CobrosDelEvento from "./facturacion/CobrosDelEvento";
import DocumentosEmitidos from "./facturacion/DocumentosEmitidos";

// PESTAÑA «FACTURACIÓN» DEL EVENTO (doc 19, paso 2a): las órdenes de compra.
//
// Cada OC con su N°, fecha, a nombre de quién viene, montos, detalle y su
// PDF de Documentos. El N° va tal cual en la referencia 801 de la factura
// (hasta 18 caracteres). A nombre de quién viene es a quién se factura esa
// OC: Santo Tomás manda OC del CFT y del Instituto Profesional para un
// mismo evento (§9.12). Con «✨ Leer con BelIA» (paso 2b) la llena BelIA
// leyendo el PDF de Documentos, y la persona confirma: lo leído trae sus
// avisos (L19, la IA puede leer mal un N° o un monto). Con «Facturar»
// (paso 2c) BelIA arma la factura de cada OC, o del evento si no hay OC
// (`facturacion/ArmarFactura`), y abajo queda lo emitido. En los pasos 1 a
// 4, contra facturacion.cl simulado: el letrero lo dice.

const NOMBRE_DE_LA_REFERENCIA: Record<string, string> = {
  nota_de_pedido: "Nota de pedido",
  hes: "HES",
  contrato: "Contrato",
  otro: "Otra referencia",
};

/** Lo que BelIA leyó y no va en los campos de la OC: los avisos y lo que
 *  dice del comprador (para su razón social, en el paso 2c). */
function LoQueLeyoBelia({ lectura }: { lectura: LecturaDeOC }) {
  const p = lectura.propuesta;
  const comprador = [p.giro, p.direccion, p.comuna, p.ciudad]
    .filter(Boolean)
    .join(" · ");
  return (
    <div className="space-y-1 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
      <p className="font-semibold flex items-center gap-1">
        <Sparkles size={13} /> Leída por BelIA: revisa antes de guardar
      </p>
      {lectura.avisos.map((a) => (
        <p key={a}>• {a}</p>
      ))}
      {comprador && <p>El comprador según la OC: {comprador}</p>}
      {p.otras_referencias.map((r) => (
        <p key={`${r.tipo}-${r.numero}`}>
          {NOMBRE_DE_LA_REFERENCIA[r.tipo] ?? r.tipo}: N° {r.numero}
        </p>
      ))}
    </div>
  );
}

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const OTRA = "otra";

const claseCasilla =
  "w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";

function Formulario({
  inicial,
  lectura,
  razones,
  pdfs,
  guardando,
  onGuardar,
  onCancelar,
}: {
  inicial: BorradorDeOC;
  lectura?: LecturaDeOC | null;
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
      {lectura && <LoQueLeyoBelia lectura={lectura} />}
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

function Fila({
  oc,
  pdf,
  facturado,
}: {
  oc: OrdenDeCompra;
  pdf?: EventDocument;
  facturado: number;
}) {
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
      {facturado > 0 && (
        <p className="text-xs font-semibold text-green-700">
          Facturado {clp(facturado)} de {clp(oc.total)}
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
  const { userRole } = useAuth();
  const llaveDeDocumentos = ["facturacion", "documentos", quotationId];
  const emitidos = useQuery({
    queryKey: llaveDeDocumentos,
    queryFn: () => getDocumentosTributarios(quotationId),
  });
  // La OC que se está facturando, o el evento sin OC.
  const [facturando, setFacturando] = useState<number | "sin_oc" | null>(null);
  const razones = useQuery({
    queryKey: ["razonesSociales", clientId],
    queryFn: () => getRazonesSociales(clientId as string),
    enabled: !!clientId,
  });

  const [editando, setEditando] = useState<number | "nueva" | null>(null);
  const [borrandoId, setBorrandoId] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);
  // Lo que leyó BelIA para la OC nueva, y el PDF que está leyendo.
  const [lectura, setLectura] = useState<LecturaDeOC | null>(null);
  const [leyendoId, setLeyendoId] = useState<number | null>(null);

  const pdfs = (docs.data ?? []).filter((d) => d.category === "ordenes_compra");
  const pdfDe = (oc: OrdenDeCompra) =>
    (docs.data ?? []).find((d) => d.id === oc.documento_id);
  const lista = ordenes.data ?? [];
  // Los PDF de órdenes de compra de Documentos que todavía no son una OC.
  const sinCargar = ordenes.isSuccess
    ? pdfs.filter((d) => !lista.some((oc) => oc.documento_id === d.id))
    : [];

  const cerrar = () => {
    setEditando(null);
    setLectura(null);
  };

  // Lo facturado de cada OC lo cuenta el motor con la cadena: lo emitido y
  // lo que quedó por confirmar, menos lo anulado o rebajado con notas.
  const facturadoDe = (ocId: number) =>
    emitidos.data?.facturado_por_oc[ocId] ?? 0;

  const emitida = async () => {
    setFacturando(null);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: llaveDeDocumentos }),
      queryClient.invalidateQueries({
        queryKey: ["razonesSociales", clientId],
      }),
      queryClient.invalidateQueries({
        queryKey: docsQueryOpts(quotationId).queryKey,
      }),
    ]);
  };

  const leer = async (doc: EventDocument) => {
    setLeyendoId(doc.id);
    try {
      setLectura(await leerOrdenDeCompra(quotationId, doc.id));
      setEditando("nueva");
    } catch (error) {
      toast.error(
        humanizeApiError(error, "BelIA no pudo leer la orden de compra."),
      );
    } finally {
      setLeyendoId(null);
    }
  };

  const guardar = async (antes: OrdenDeCompra | null, b: BorradorDeOC) => {
    const cambios = cambiosDeOC(antes, b);
    if (Object.keys(cambios).length === 0) {
      cerrar();
      return;
    }
    setGuardando(true);
    try {
      if (antes) await updateOrdenDeCompra(quotationId, antes.id, cambios);
      else await createOrdenDeCompra(quotationId, cambios);
      await queryClient.invalidateQueries({ queryKey: llave });
      toast.success("Orden de compra guardada.");
      cerrar();
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
      key={antes?.id ?? `nueva-${lectura?.documento_id ?? ""}`}
      inicial={
        !antes && lectura
          ? borradorDeLaLectura(lectura.propuesta, lectura.documento_id)
          : borradorDeOC(antes)
      }
      lectura={antes ? null : lectura}
      razones={razones.data ?? []}
      pdfs={pdfs}
      guardando={guardando}
      onGuardar={(b) => guardar(antes, b)}
      onCancelar={cerrar}
    />
  );

  return (
    <div className="max-w-3xl space-y-4">
      {emitidos.data?.ambiente === "simulado" && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Modo simulado: facturacion.cl todavía no está conectado. Las facturas
          se arman y se numeran, pero no sale nada al SII.
        </p>
      )}
      <div className="bg-white rounded-lg border border-gray-200 p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-gray-900">
            Órdenes de compra
          </h3>
          {editando === null && facturando === null && (
            <button
              type="button"
              onClick={() => setEditando("nueva")}
              className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
            >
              <Plus size={13} /> Agregar OC
            </button>
          )}
        </div>

        {sinCargar.length > 0 && editando === null && facturando === null && (
          <div className="space-y-1.5 rounded-lg bg-gray-50 p-3">
            {sinCargar.map((d) => (
              <div
                key={d.id}
                className="flex items-center justify-between gap-2 text-sm"
              >
                <span className="text-gray-700 min-w-0 truncate">
                  {d.file_name}
                  <span className="text-gray-400">
                    {" "}
                    · {fechaCorta(d.uploaded_at.slice(0, 10))}
                  </span>
                </span>
                <button
                  type="button"
                  disabled={leyendoId !== null}
                  onClick={() => leer(d)}
                  className="flex shrink-0 items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
                >
                  <Sparkles size={12} />
                  {leyendoId === d.id
                    ? "BelIA está leyendo…"
                    : "Leer con BelIA"}
                </button>
              </div>
            ))}
          </div>
        )}

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
              <Fila oc={oc} pdf={pdfDe(oc)} facturado={facturadoDe(oc.id)} />
              {editando === null && facturando === null && (
                <div className="flex shrink-0 items-start gap-2 text-gray-400">
                  {/* Nunca más del 100 % de una OC (doc 19 §5.3). */}
                  {facturadoDe(oc.id) < oc.total && (
                    <button
                      type="button"
                      onClick={() => setFacturando(oc.id)}
                      className="flex items-center gap-1 rounded-lg bg-violet-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-violet-700"
                    >
                      <FileText size={12} /> Facturar
                    </button>
                  )}
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

        {editando === null && facturando === null && ordenes.isSuccess && (
          <button
            type="button"
            onClick={() => setFacturando("sin_oc")}
            className="text-xs font-semibold text-violet-700 hover:underline"
          >
            Facturar sin OC (un % o un monto del evento)
          </button>
        )}
      </div>

      {facturando !== null && (
        <ArmarFactura
          quotationId={quotationId}
          ordenDeCompraId={facturando === "sin_oc" ? null : facturando}
          puedeEmitir={userRole === "administrador"}
          onCerrar={() => setFacturando(null)}
          onEmitida={emitida}
        />
      )}

      <DocumentosEmitidos
        documentos={emitidos.data?.documentos ?? []}
        ocs={lista}
      />

      <CobrosDelEvento
        quotationId={quotationId}
        esAdmin={userRole === "administrador"}
      />
    </div>
  );
}
