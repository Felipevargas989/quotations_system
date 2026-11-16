import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ConfirmInline from "../../components/ConfirmInline";
import NumberInput from "../../components/inputs/NumberInput";
import { toast } from "../../components/toast/Toast";
import type { MedioDePago } from "../../constants/facturacion";
import { cerrarCaja } from "../../services/caja.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { Seccion } from "./PiezasDelDocumento";

// EL CIERRE DE LA CAJA (doc 19 §9.43; desde el §9.55, dentro del panel de la
// caja abierta). Quien cierra anota cuánto tiene en efectivo, débito,
// crédito y transferencia (y las pulseras, §9.49). Recepción cierra a
// ciegas: no ve lo esperado. Quien revisa los cierres ve, al lado de cada
// casilla, lo que dice el sistema («Según sistema»).

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const casilla =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const titulo = "text-xs text-gray-500";
const boton =
  "rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50";

const MEDIOS = [
  { clave: "efectivo", label: "Efectivo contado (con el sencillo)" },
  { clave: "debito", label: "Débito (resumen de la máquina)" },
  { clave: "credito", label: "Crédito (resumen de la máquina)" },
  { clave: "transferencia", label: "Transferencias (comprobantes)" },
] as const;
type Medio = (typeof MEDIOS)[number]["clave"];

export default function CerrarLaCaja({
  nombre,
  cuentaPulseras,
  esperado,
  onCerrada,
}: {
  /** Quien cierra: el perfil de la sesión. */
  readonly nombre: string | null;
  /** §9.49: si el cierre pide contar las pulseras. */
  readonly cuentaPulseras: boolean;
  /** §9.55: lo que dice el sistema por medio de pago. Solo llega a quien
   *  revisa los cierres; sin él, el cierre es ciego. */
  readonly esperado?: Partial<Record<MedioDePago, number>> | null;
  readonly onCerrada: (cerradaEn: string) => void;
}) {
  const queryClient = useQueryClient();
  const [montos, setMontos] = useState<Partial<Record<Medio, number>>>({});
  const [comentario, setComentario] = useState("");
  const [pulseras, setPulseras] = useState<number | undefined>(undefined);
  const [confirmando, setConfirmando] = useState(false);

  const cerrar = useMutation({
    mutationFn: () =>
      cerrarCaja({
        efectivo: montos.efectivo ?? 0,
        debito: montos.debito ?? 0,
        credito: montos.credito ?? 0,
        transferencia: montos.transferencia ?? 0,
        comentario: comentario.trim() || null,
        ...(cuentaPulseras ? { pulseras: pulseras ?? 0 } : {}),
      }),
    onSuccess: async (r) => {
      setConfirmando(false);
      // Una consulta de la caja que venía en camino (la que parte sola al
      // volver a la ventana) no puede traer de vuelta la caja «abierta».
      await queryClient.cancelQueries({ queryKey: ["caja"], exact: true });
      queryClient.setQueryData(["caja"], { abierta: null });
      void queryClient.invalidateQueries({ queryKey: ["caja", "cierres"] });
      void queryClient.invalidateQueries({ queryKey: ["caja", "esperado"] });
      onCerrada(r.cerrada_en);
    },
    onError: (e) => {
      setConfirmando(false);
      toast.error(humanizeApiError(e, "No se pudo cerrar la caja."));
    },
  });

  const faltan =
    MEDIOS.filter((m) => montos[m.clave] == null).length +
    (cuentaPulseras && pulseras == null ? 1 : 0);

  return (
    <Seccion titulo="Cerrar caja: ¿cuánto tienes?">
      <div className="grid gap-3 sm:grid-cols-2">
        {MEDIOS.map((m) => (
          <div key={m.clave} className="flex items-end gap-2">
            <label className="block min-w-0 flex-1">
              <span className={titulo}>{m.label}</span>
              <NumberInput
                value={montos[m.clave]}
                min={0}
                currency
                placeholder="$0"
                onChange={(v) => setMontos({ ...montos, [m.clave]: v })}
                className="text-sm"
              />
            </label>
            {esperado && esperado[m.clave] != null && (
              <span className="whitespace-nowrap pb-1 text-right text-xs text-blue-700">
                Según sistema
                <strong className="block text-sm">
                  {clp(esperado[m.clave] ?? 0)}
                </strong>
              </span>
            )}
          </div>
        ))}
        {cuentaPulseras && (
          <label className="block">
            <span className={titulo}>Pulseras que te quedan</span>
            <NumberInput
              value={pulseras}
              min={0}
              placeholder="0"
              onChange={setPulseras}
              className="text-sm"
            />
          </label>
        )}
        <div>
          <span className={titulo}>Cierra</span>
          <p className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
            {nombre ?? "—"}
          </p>
        </div>
        <label className="block">
          <span className={titulo}>Comentario (opcional)</span>
          <input
            value={comentario}
            maxLength={300}
            placeholder="La máquina 2 se cortó a las 17:00"
            onChange={(e) => setComentario(e.target.value)}
            className={casilla}
          />
        </label>
      </div>
      {faltan > 0 && (
        <p className="text-right text-xs text-gray-500">
          {cuentaPulseras
            ? "Anota los cuatro montos y las pulseras: si no hay, pon 0."
            : "Anota los cuatro montos: si un medio no tuvo ventas, pon 0."}
        </p>
      )}
      <div className="flex justify-end">
        {confirmando ? (
          <ConfirmInline
            question="¿Cerrar la caja? Después no se puede reabrir."
            yesLabel="Sí, cerrar"
            tono="normal"
            busy={cerrar.isPending}
            onYes={() => cerrar.mutate()}
            onNo={() => setConfirmando(false)}
          />
        ) : (
          <button
            type="button"
            disabled={faltan > 0}
            onClick={() => setConfirmando(true)}
            className={boton}
          >
            Cerrar caja
          </button>
        )}
      </div>
    </Seccion>
  );
}
