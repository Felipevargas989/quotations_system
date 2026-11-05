import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import FileViewLink from "../../components/FileViewLink";
import NumberInput from "../../components/inputs/NumberInput";
import { toast } from "../../components/toast/Toast";
import { useAuth } from "../../contexts/AuthContext";
import {
  crearCobro,
  getEmitidasHoy,
  getPorBoletear,
  type CobroPorBoletear as Cobro,
} from "../../services/boletas.service";
import { humanizeApiError } from "../../utils/apiErrors";
import BoletaSuelta from "./BoletaSuelta";
import CobroPorBoletear from "./CobroPorBoletear";
import TarifarioDeBoletas from "./TarifarioDeBoletas";

// LA SECCIÓN «BOLETAS» (doc 19 §9.4, paso 3a; maqueta del 04-11), de
// recepción hacia arriba (D5) y solo con el módulo propio `facturacion`.
//
// «Por boletear»: los cobros que dejó el administrador (desde el evento o
// acá mismo), cada uno repartido por cabaña. «Emitidas hoy»: el control del
// día de la casa (el SII ya no pide el resumen diario, L18). La boleta
// suelta con el tarifario es el paso 3b, y el tarifario lo escribe el
// administrador (D3: «tarifario aparte»). En los pasos 1 a 4, contra
// facturacion.cl simulado: el letrero lo dice.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const LLAVE = ["boletas", "por-boletear"];
const LLAVE_HOY = ["boletas", "emitidas-hoy"];

const hora = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString("es-CL", {
        timeZone: "America/Santiago",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

/** Un cobro suelto (sin evento): solo el administrador. */
function NuevoCobro({ onCreado }: { readonly onCreado: () => void }) {
  const [abierto, setAbierto] = useState(false);
  const [descripcion, setDescripcion] = useState("");
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [guardando, setGuardando] = useState(false);
  if (!abierto)
    return (
      <button
        type="button"
        onClick={() => setAbierto(true)}
        className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
      >
        <Plus size={13} /> Nuevo cobro por boletear
      </button>
    );
  const guardar = async () => {
    if (!descripcion.trim() || !total) return;
    setGuardando(true);
    try {
      await crearCobro({ descripcion: descripcion.trim(), total });
      setAbierto(false);
      setDescripcion("");
      setTotal(undefined);
      onCreado();
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo dejar el cobro."));
    } finally {
      setGuardando(false);
    }
  };
  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-gray-200 bg-white p-3">
      <label className="block min-w-[16rem] flex-1">
        <span className="flex justify-between text-xs text-gray-500">
          Qué se cobra
          <span>{Array.from(descripcion).length}/55</span>
        </span>
        <input
          type="text"
          value={descripcion}
          maxLength={55}
          placeholder="Ej.: Delegación Vilcún · alojamiento 12 al 15-11"
          onChange={(e) => setDescripcion(e.target.value)}
          className="w-full px-3 py-1.5 text-sm border border-gray-300 rounded-lg"
        />
      </label>
      <label className="block w-40">
        <span className="text-xs text-gray-500">Total con IVA</span>
        <NumberInput
          value={total}
          min={0}
          currency
          placeholder="0"
          onChange={setTotal}
          className="px-3 py-1.5 text-sm"
        />
      </label>
      <button
        type="button"
        disabled={guardando || !descripcion.trim() || !total}
        onClick={() => void guardar()}
        className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-semibold disabled:opacity-50"
      >
        {guardando ? "Guardando…" : "Guardar"}
      </button>
      <button
        type="button"
        onClick={() => setAbierto(false)}
        className="px-3 py-1.5 bg-gray-100 text-gray-600 text-xs rounded-lg font-semibold"
      >
        Cancelar
      </button>
    </div>
  );
}

export default function BoletasPage() {
  const queryClient = useQueryClient();
  const { userRole } = useAuth();
  const esAdmin = userRole === "administrador";
  const [pestana, setPestana] = useState<
    "suelta" | "por_boletear" | "hoy" | "tarifario"
  >("suelta");
  const porBoletear = useQuery({
    queryKey: LLAVE,
    queryFn: () => getPorBoletear(),
  });
  const hoy = useQuery({ queryKey: LLAVE_HOY, queryFn: getEmitidasHoy });

  const cobros = porBoletear.data?.cobros ?? [];
  const boletas = hoy.data?.boletas ?? [];
  const simulado =
    (porBoletear.data?.ambiente ?? hoy.data?.ambiente) === "simulado";

  const refrescar = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: LLAVE }),
      queryClient.invalidateQueries({ queryKey: LLAVE_HOY }),
    ]);
  const cambiar = (c: Cobro) => {
    queryClient.setQueryData(
      LLAVE,
      (antes: { ambiente: string; cobros: Cobro[] } | undefined) =>
        antes && {
          ...antes,
          cobros: antes.cobros.map((x) => (x.id === c.id ? c : x)),
        },
    );
    void queryClient.invalidateQueries({ queryKey: LLAVE_HOY });
  };

  // Si hay algo por boletear, la página parte ahí (la maqueta); si no, en
  // la boleta suelta. Una sola vez: después manda lo que elija la persona.
  const elegida = useRef(false);
  useEffect(() => {
    if (elegida.current || !porBoletear.isSuccess) return;
    elegida.current = true;
    if (porBoletear.data.cobros.length > 0) setPestana("por_boletear");
  }, [porBoletear.isSuccess, porBoletear.data]);

  const pestanas = [
    { key: "suelta" as const, label: "Boleta suelta" },
    { key: "por_boletear" as const, label: `Por boletear (${cobros.length})` },
    { key: "hoy" as const, label: `Emitidas hoy (${boletas.length})` },
    ...(esAdmin ? [{ key: "tarifario" as const, label: "Tarifario" }] : []),
  ];

  return (
    <div className="max-w-4xl space-y-4 p-4 sm:p-6">
      <h1 className="text-xl font-semibold text-gray-900">Boletas</h1>
      {simulado && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          Modo simulado: facturacion.cl todavía no está conectado. Las boletas
          se arman y se numeran, pero no sale nada al SII.
        </p>
      )}
      <div className="flex gap-4 border-b border-gray-200">
        {pestanas.map((p) => (
          <button
            key={p.key}
            type="button"
            onClick={() => setPestana(p.key)}
            className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${pestana === p.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {pestana === "suelta" ? (
        <BoletaSuelta
          esAdmin={esAdmin}
          onEmitida={() =>
            void queryClient.invalidateQueries({ queryKey: LLAVE_HOY })
          }
        />
      ) : pestana === "tarifario" ? (
        <TarifarioDeBoletas />
      ) : pestana === "por_boletear" ? (
        <div className="space-y-3">
          {esAdmin && <NuevoCobro onCreado={() => void refrescar()} />}
          {porBoletear.isPending ? (
            <p className="text-sm text-gray-400">Cargando…</p>
          ) : porBoletear.isError ? (
            <p className="text-sm text-red-600">
              No se pudo cargar lo que hay por boletear.
            </p>
          ) : cobros.length === 0 ? (
            <p className="text-sm text-gray-500">
              No hay nada por boletear. Los cobros los deja el administrador
              desde el evento (pestaña Facturación) o acá.
            </p>
          ) : (
            cobros.map((c) => (
              <CobroPorBoletear
                key={c.id}
                cobro={c}
                esAdmin={esAdmin}
                onCambio={cambiar}
                onBorrado={() => void refrescar()}
              />
            ))
          )}
        </div>
      ) : hoy.isPending ? (
        <p className="text-sm text-gray-400">Cargando…</p>
      ) : boletas.length === 0 ? (
        <p className="text-sm text-gray-500">
          Hoy no se ha emitido ninguna boleta.
        </p>
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
                <th className="py-1 font-medium">N°</th>
                <th className="py-1 font-medium">Qué</th>
                <th className="py-1 text-right font-medium">Monto</th>
                <th className="py-1 pl-3 font-medium">Correo</th>
                <th className="py-1 pl-3 font-medium">Hora</th>
                <th className="py-1" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {boletas.map((b) => (
                <tr key={b.id}>
                  <td className="py-1.5 font-semibold text-gray-900">
                    {b.estado === "por_confirmar" ? (
                      <span className="text-amber-700">Por confirmar</span>
                    ) : (
                      b.folio
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-gray-700">
                    {b.descripcion ?? b.cabana ?? "—"}
                  </td>
                  <td className="py-1.5 text-right whitespace-nowrap">
                    {clp(b.total)}
                  </td>
                  <td className="py-1.5 pl-3 text-gray-600 break-all">
                    {b.correo || "—"}
                  </td>
                  <td className="py-1.5 pl-3 text-gray-500">
                    {hora(b.emitido_en)}
                  </td>
                  <td className="py-1.5 pl-3 text-right">
                    {b.pdf_path && (
                      <FileViewLink
                        url={b.pdf_path}
                        title={`Boleta N° ${b.folio}.pdf`}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-gray-500">
            Total del día:{" "}
            {clp(
              boletas
                .filter((b) => b.estado === "emitido")
                .reduce((s, b) => s + b.total, 0),
            )}
          </p>
        </div>
      )}
    </div>
  );
}
