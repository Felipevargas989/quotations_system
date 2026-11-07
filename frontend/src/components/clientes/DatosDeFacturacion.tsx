import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Receipt, Trash2 } from "lucide-react";
import { toast } from "../toast/Toast";
import RutInput from "../inputs/RutInput";
import MultiSelect from "../MultiSelect";
import ConfirmInline from "../ConfirmInline";
import {
  RazonSocial,
  createRazonSocial,
  deleteRazonSocial,
  getRazonesSociales,
  updateRazonSocial,
} from "../../services/razonesSociales.service";
import { formatearRut } from "../../utils/rut";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  BorradorDeRazonSocial,
  borradorDeRazonSocial,
  cambiosDeRazonSocial,
  problemaDeCorreos,
} from "../../utils/datosDeFacturacion";
import {
  LARGO_MAXIMO,
  REFERENCIAS_QUE_PIDE,
  nombreDeReferencia,
} from "../../constants/facturacion";

// DATOS DE FACTURACIÓN DEL CLIENTE (migración 184, doc 19 §9.12).
//
// Felipe, 04-11: *"es posible como en CCU que algunas facturas sean a un rut
// y otras a otro"*. Por eso es una LISTA de razones sociales: Santo Tomás
// factura un mismo evento al CFT y al Instituto Profesional, cada uno con su
// RUT. Cada una con lo que va en la factura de facturacion.cl (RUT con
// dígito verificador, razón social, giro, dirección y los correos a los que
// facturacion.cl le manda el documento) y las referencias que exige (CCU:
// la orden de compra y la nota de pedido).
//
// Cada casilla tiene el largo que cabe en la factura y lo cuenta mientras
// se escribe: nada se corta a escondidas al facturar (doc 19 §9.10).

const claseCasilla =
  "w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";

function Casilla({
  etiqueta,
  valor,
  largo,
  placeholder,
  onChange,
}: {
  etiqueta: string;
  valor: string;
  largo: number;
  placeholder?: string;
  onChange: (valor: string) => void;
}) {
  return (
    <label className="block">
      <span className="flex justify-between text-xs text-gray-500">
        {etiqueta}
        <span className={valor.length >= largo ? "text-amber-600" : ""}>
          {valor.length}/{largo}
        </span>
      </span>
      <input
        type="text"
        value={valor}
        maxLength={largo}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={claseCasilla}
      />
    </label>
  );
}

function Formulario({
  inicial,
  guardando,
  onGuardar,
  onCancelar,
}: {
  inicial: BorradorDeRazonSocial;
  guardando: boolean;
  onGuardar: (borrador: BorradorDeRazonSocial) => void;
  onCancelar: () => void;
}) {
  const [borrador, setBorrador] = useState(inicial);
  const [rutValido, setRutValido] = useState(!!inicial.rut);
  const poner = (
    campo: keyof BorradorDeRazonSocial,
    valor: string | string[],
  ) => setBorrador((b) => ({ ...b, [campo]: valor }));

  const problemaCorreos = problemaDeCorreos(borrador.correo_facturacion);
  const listo = rutValido && !!borrador.razon_social.trim() && !problemaCorreos;

  return (
    <div className="space-y-2 rounded-lg border border-blue-100 bg-blue-50/40 p-3">
      <label className="block">
        <span className="text-xs text-gray-500">RUT</span>
        <RutInput
          value={borrador.rut}
          onChange={(rut, valido) => {
            poner("rut", rut);
            setRutValido(valido);
          }}
          obligatorio
          placeholder="65.175.242-6"
          className="text-sm"
        />
      </label>
      <Casilla
        etiqueta="Razón social"
        valor={borrador.razon_social}
        largo={LARGO_MAXIMO.razon_social}
        onChange={(v) => poner("razon_social", v)}
      />
      <Casilla
        etiqueta="Giro"
        valor={borrador.giro}
        largo={LARGO_MAXIMO.giro}
        onChange={(v) => poner("giro", v)}
      />
      <Casilla
        etiqueta="Dirección"
        valor={borrador.direccion}
        largo={LARGO_MAXIMO.direccion}
        onChange={(v) => poner("direccion", v)}
      />
      <div className="grid grid-cols-2 gap-2">
        <Casilla
          etiqueta="Comuna"
          valor={borrador.comuna}
          largo={LARGO_MAXIMO.comuna}
          onChange={(v) => poner("comuna", v)}
        />
        <Casilla
          etiqueta="Ciudad"
          valor={borrador.ciudad}
          largo={LARGO_MAXIMO.ciudad}
          onChange={(v) => poner("ciudad", v)}
        />
      </div>
      <Casilla
        etiqueta="Correos para la factura"
        valor={borrador.correo_facturacion}
        largo={LARGO_MAXIMO.correo_facturacion}
        placeholder="facturas@empresa.cl, pagos@empresa.cl"
        onChange={(v) => poner("correo_facturacion", v)}
      />
      {problemaCorreos && (
        <p className="text-xs text-red-600 font-medium">{problemaCorreos}</p>
      )}
      <div>
        <span className="text-xs text-gray-500">Referencias que pide</span>
        <MultiSelect
          options={REFERENCIAS_QUE_PIDE.map((r) => ({
            value: r.codigo,
            label: `${r.nombre} (${r.codigo})`,
          }))}
          value={borrador.referencias_exigidas}
          onChange={(v) => poner("referencias_exigidas", v)}
          placeholder="Ninguna"
        />
      </div>
      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          disabled={guardando || !listo}
          onClick={() => onGuardar(borrador)}
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
      </div>
    </div>
  );
}

function Ficha({ r }: { r: RazonSocial }) {
  const direccion = [r.direccion, r.comuna, r.ciudad]
    .filter(Boolean)
    .join(", ");
  return (
    <div className="space-y-0.5 text-sm min-w-0">
      <p className="font-medium text-gray-900 break-words">{r.razon_social}</p>
      <p className="text-gray-600">
        RUT {formatearRut(r.rut)}
        {r.giro ? ` · ${r.giro}` : ""}
      </p>
      {direccion && <p className="text-gray-600 break-words">{direccion}</p>}
      {r.correo_facturacion && (
        <p className="text-gray-600 break-words">{r.correo_facturacion}</p>
      )}
      {r.referencias_exigidas.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          {r.referencias_exigidas.map((codigo) => (
            <span
              key={codigo}
              className="px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 text-xs font-medium"
            >
              {nombreDeReferencia(codigo)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export default function DatosDeFacturacion({
  clientId,
  puedeEditar,
}: {
  clientId: string;
  puedeEditar: boolean;
}) {
  const queryClient = useQueryClient();
  const llave = ["razonesSociales", clientId];
  const consulta = useQuery({
    queryKey: llave,
    queryFn: () => getRazonesSociales(clientId),
  });
  const razones = consulta.data ?? [];

  // Una sola a la vez: la que se edita (su id) o «nueva».
  const [editando, setEditando] = useState<number | "nueva" | null>(null);
  const [borrandoId, setBorrandoId] = useState<number | null>(null);
  const [guardando, setGuardando] = useState(false);

  const recargar = () => queryClient.invalidateQueries({ queryKey: llave });

  const guardar = async (
    antes: RazonSocial | null,
    borrador: BorradorDeRazonSocial,
  ) => {
    const cambios = cambiosDeRazonSocial(antes, borrador);
    if (Object.keys(cambios).length === 0) {
      setEditando(null);
      return;
    }
    setGuardando(true);
    try {
      if (antes) await updateRazonSocial(clientId, antes.id, cambios);
      else await createRazonSocial(clientId, cambios);
      await recargar();
      toast.success("Datos de facturación guardados.");
      setEditando(null);
    } catch (error) {
      toast.error(humanizeApiError(error, "No se pudieron guardar los datos."));
    } finally {
      setGuardando(false);
    }
  };

  const quitar = async (id: number) => {
    try {
      await deleteRazonSocial(clientId, id);
      await recargar();
      toast.success("Razón social quitada.");
    } catch (error) {
      toast.error(humanizeApiError(error, "No se pudo quitar."));
    } finally {
      setBorrandoId(null);
    }
  };

  return (
    <div className="bg-white rounded-lg shadow p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <Receipt size={18} /> Datos de facturación
        </h2>
        {puedeEditar && editando === null && (
          <button
            type="button"
            onClick={() => setEditando("nueva")}
            className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
          >
            <Plus size={13} /> Agregar
          </button>
        )}
      </div>

      {consulta.isPending ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : consulta.isError ? (
        <p className="text-sm text-red-600">
          No se pudieron cargar los datos de facturación.
        </p>
      ) : razones.length === 0 && editando !== "nueva" ? (
        <p className="text-sm text-gray-500">Sin datos de facturación.</p>
      ) : null}

      {razones.map((r) =>
        editando === r.id ? (
          <Formulario
            key={r.id}
            inicial={borradorDeRazonSocial(r)}
            guardando={guardando}
            onGuardar={(b) => guardar(r, b)}
            onCancelar={() => setEditando(null)}
          />
        ) : borrandoId === r.id ? (
          <ConfirmInline
            key={r.id}
            question={`¿Quitar ${r.razon_social}?`}
            onYes={() => quitar(r.id)}
            onNo={() => setBorrandoId(null)}
          />
        ) : (
          <div
            key={r.id}
            className="flex items-start justify-between gap-2 border-t border-gray-100 pt-3 first:border-t-0 first:pt-0"
          >
            <Ficha r={r} />
            {puedeEditar && editando === null && (
              <div className="flex shrink-0 gap-2 text-gray-400">
                <button
                  type="button"
                  onClick={() => setEditando(r.id)}
                  className="hover:text-blue-600"
                  title="Editar"
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setBorrandoId(r.id)}
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

      {editando === "nueva" && (
        <Formulario
          inicial={borradorDeRazonSocial()}
          guardando={guardando}
          onGuardar={(b) => guardar(null, b)}
          onCancelar={() => setEditando(null)}
        />
      )}
    </div>
  );
}
