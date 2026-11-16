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
// administradora; no es venta) y los retiros, y las dos acciones siempre en
// el mismo lugar. Quien opera la caja ve sus movimientos, nunca lo esperado.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CL", {
    hour: "2-digit",
    minute: "2-digit",
  });
const casilla =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const titulo = "text-xs text-gray-500";

export default function MovimientosDelTurno({
  abierta,
}: {
  readonly abierta: CajaAbierta;
}) {
  const queryClient = useQueryClient();
  const [nuevo, setNuevo] = useState<{
    tipo: TipoDeMovimiento;
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
      {nuevo ? (
        <div className="flex flex-wrap items-end gap-2">
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
              placeholder={TIPO[nuevo.tipo].placeholder}
              onChange={(e) => setNuevo({ ...nuevo, motivo: e.target.value })}
              className={casilla}
            />
          </label>
          <button
            type="button"
            disabled={!nuevo.monto || !nuevo.motivo.trim() || guardar.isPending}
            onClick={() => guardar.mutate()}
            className={TIPO[nuevo.tipo].claseBoton}
          >
            Guardar {nuevo.tipo}
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
        <div className="flex gap-3">
          {(["ingreso", "retiro"] as const).map((tipo) => (
            <button
              key={tipo}
              type="button"
              onClick={() => setNuevo({ tipo, motivo: "" })}
              className={`text-xs font-semibold hover:underline ${TIPO[tipo].claseMonto}`}
            >
              {TIPO[tipo].boton}
            </button>
          ))}
        </div>
      )}
    </Seccion>
  );
}
