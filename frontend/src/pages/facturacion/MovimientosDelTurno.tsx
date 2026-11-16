import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import NumberInput from "../../components/inputs/NumberInput";
import { toast } from "../../components/toast/Toast";
import {
  anotarIngreso,
  anotarRetiro,
  type CajaAbierta,
  type TipoDeMovimiento,
} from "../../services/caja.service";
import { movimientosDe, TIPO } from "./tipoDeMovimiento";
import { humanizeApiError } from "../../utils/apiErrors";
import { Seccion } from "./PiezasDelDocumento";

// LOS MOVIMIENTOS DEL TURNO (doc 19 §9.51). Felipe, 16-11: *"esto debería
// ser retiros y abonos, en caso que mande dinero, o sencillo"*. Una lista
// por hora con los ingresos (la plata que mandan el dueño o la
// administradora; no es venta) y los retiros. Desde el §9.55 vive en el panel
// de la caja abierta, con un solo botón «Anotar movimiento» (se elige
// ingreso o retiro) que ve solo quien tiene «Anotar movimientos de caja»
// (de fábrica, operaciones y el administrador; recepción ya no). Los
// movimientos los ven todos los que ven la caja, nunca lo esperado.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
const casilla =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const titulo = "text-xs text-gray-500";

const boton =
  "rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50";

export default function MovimientosDelTurno({
  abierta,
  puedeAnotar = false,
}: {
  readonly abierta: CajaAbierta;
  /** §9.55: el permiso «Anotar movimientos de caja». */
  readonly puedeAnotar?: boolean;
}) {
  const queryClient = useQueryClient();
  const [nuevo, setNuevo] = useState<{
    tipo?: TipoDeMovimiento;
    monto?: number;
    motivo: string;
  } | null>(null);

  const guardar = useMutation({
    mutationFn: () => {
      const datos = {
        monto: nuevo?.monto ?? 0,
        motivo: nuevo?.motivo.trim() ?? "",
      };
      return nuevo?.tipo === "ingreso"
        ? anotarIngreso(datos)
        : anotarRetiro(datos);
    },
    onSuccess: (datos) => {
      queryClient.setQueryData(["caja"], datos);
      // §9.55: lo que dice el sistema cambia con el movimiento.
      void queryClient.invalidateQueries({ queryKey: ["caja", "esperado"] });
      setNuevo(null);
    },
    onError: (e) =>
      toast.error(
        humanizeApiError(
          e,
          nuevo?.tipo === "ingreso"
            ? "No se pudo anotar el ingreso."
            : "No se pudo anotar el retiro.",
        ),
      ),
  });

  const movimientos = movimientosDe(abierta);

  return (
    <Seccion titulo="Movimientos del turno">
      {movimientos.length === 0 ? (
        <p className="text-xs text-gray-400">Sin movimientos.</p>
      ) : (
        <ul className="divide-y divide-gray-100 text-sm">
          {movimientos.map((m) => {
            const t = TIPO[m.tipo];
            return (
              <li
                key={`${m.tipo}-${m.id}`}
                className="flex items-center gap-2 py-1.5"
              >
                <span
                  className={`whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ${t.claseChip}`}
                >
                  {t.chip}
                </span>
                <span className="min-w-0 flex-1 truncate" title={m.motivo}>
                  {m.motivo}
                </span>
                <span className="whitespace-nowrap text-xs text-gray-500">
                  {hora(m.creado_en)}
                </span>
                <span
                  className={`w-24 whitespace-nowrap text-right font-medium ${t.claseMonto}`}
                >
                  {t.signo}
                  {clp(m.monto)}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {!puedeAnotar ? null : nuevo ? (
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex gap-1" role="group" aria-label="Tipo">
            {(["ingreso", "retiro"] as const).map((tipo) => (
              <button
                key={tipo}
                type="button"
                aria-pressed={nuevo.tipo === tipo}
                onClick={() => setNuevo({ ...nuevo, tipo })}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                  nuevo.tipo === tipo
                    ? TIPO[tipo].claseChip
                    : "border border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {TIPO[tipo].chip}
              </button>
            ))}
          </div>
          <label className="block w-36">
            <span className={titulo}>Monto</span>
            <NumberInput
              value={nuevo.monto}
              min={1}
              currency
              onChange={(v) => setNuevo({ ...nuevo, monto: v })}
              className="text-sm"
            />
          </label>
          <label className="block min-w-[12rem] flex-1">
            <span className={titulo}>Motivo</span>
            <input
              value={nuevo.motivo}
              maxLength={120}
              placeholder={nuevo.tipo ? TIPO[nuevo.tipo].placeholder : ""}
              onChange={(e) => setNuevo({ ...nuevo, motivo: e.target.value })}
              className={casilla}
            />
          </label>
          <button
            type="button"
            disabled={
              !nuevo.tipo ||
              !nuevo.monto ||
              !nuevo.motivo.trim() ||
              guardar.isPending
            }
            onClick={() => guardar.mutate()}
            className={nuevo.tipo ? TIPO[nuevo.tipo].claseBoton : boton}
          >
            {nuevo.tipo ? `Guardar ${nuevo.tipo}` : "Guardar"}
          </button>
          <button
            type="button"
            onClick={() => setNuevo(null)}
            className="px-2 py-2 text-sm text-gray-600 hover:underline"
          >
            Cancelar
          </button>
        </div>
      ) : (
        <div>
          <button
            type="button"
            onClick={() => setNuevo({ motivo: "" })}
            className={boton}
          >
            Anotar movimiento
          </button>
        </div>
      )}
    </Seccion>
  );
}
