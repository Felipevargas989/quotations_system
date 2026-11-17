import { useId, useState, type ReactNode } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import ConfirmInline from "../../components/ConfirmInline";
import NumberInput from "../../components/inputs/NumberInput";
import { toast } from "../../components/toast/Toast";
import type { MedioDePago } from "../../constants/facturacion";
import { cerrarCaja } from "../../services/caja.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { Seccion } from "./PiezasDelDocumento";

// EL CIERRE DE LA CAJA (doc 19 §9.43; desde el §9.55, dentro del panel de la
// caja abierta). Felipe, 16-11: *"creo que mejoraría el cerrar caja… a nivel
// de front puede quedar mejor"*. Una fila por medio de pago (y las
// pulseras, §9.49) con lo que se contó. Quien revisa los cierres ve además
// «Según sistema» y la diferencia de cada fila al escribir, el total en
// plata y una banda con la diferencia. Recepción cierra a ciegas: solo el
// medio y «Contaste», sin nada de lo que dice el sistema.

const pesos = (n: number) =>
  `$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;
const casilla =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const boton =
  "w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50";
const chip =
  "inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold";
const VERDE = `${chip} border-green-200 bg-green-50 text-green-700`;
const ROJO = `${chip} border-red-200 bg-red-50 text-red-700`;
const th = "whitespace-nowrap pb-1 text-right font-normal";

const MEDIOS = [
  { clave: "efectivo", nombre: "Efectivo", detalle: "con el sencillo" },
  { clave: "debito", nombre: "Débito", detalle: "resumen de la máquina" },
  { clave: "credito", nombre: "Crédito", detalle: "resumen de la máquina" },
  {
    clave: "transferencia",
    nombre: "Transferencias",
    detalle: "comprobantes",
  },
] as const;
type Medio = (typeof MEDIOS)[number]["clave"];

/** «Cuadra», «Faltan $X» o «Sobran $X»; «—» si falta un lado (vacío no es
 *  cero). Las pulseras van en unidades. */
function Diferencia({
  contaste,
  sistema,
  unidades = false,
}: {
  readonly contaste: number | undefined;
  readonly sistema: number | null | undefined;
  readonly unidades?: boolean;
}) {
  if (contaste == null || sistema == null)
    return <span className="text-gray-400">—</span>;
  const d = contaste - sistema;
  if (d === 0) return <span className={VERDE}>Cuadra</span>;
  return (
    <span className={ROJO}>
      {d < 0 ? "Faltan" : "Sobran"} {unidades ? Math.abs(d) : pesos(d)}
    </span>
  );
}

/** §9.56: la casilla vacía se ve vacía (sin «$0» de muestra); al apretar
 *  «Cerrar caja» con vacías, cada una que falta va con borde rojo. */
function Casilla({
  falta,
  children,
}: {
  readonly falta: boolean;
  readonly children: ReactNode;
}) {
  return (
    <div
      data-falta={falta || undefined}
      className={falta ? "rounded-lg ring-2 ring-red-500" : undefined}
    >
      {children}
    </div>
  );
}

export default function CerrarLaCaja({
  nombre,
  cuentaPulseras,
  ciego = true,
  esperado,
  pulserasSegunSistema,
  onCerrada,
}: {
  /** Quien cierra: el perfil de la sesión. */
  readonly nombre: string | null;
  /** §9.49: si el cierre pide contar las pulseras. */
  readonly cuentaPulseras: boolean;
  /** Sin el permiso de revisar cierres: solo el medio y «Contaste». */
  readonly ciego?: boolean;
  /** §9.55: lo que dice el sistema por medio de pago (solo quien revisa). */
  readonly esperado?: Partial<Record<MedioDePago, number>> | null;
  /** Las pulseras que debería haber, si se tiene el dato. */
  readonly pulserasSegunSistema?: number | null;
  readonly onCerrada: (cerradaEn: string) => void;
}) {
  const queryClient = useQueryClient();
  const idBase = useId();
  const [montos, setMontos] = useState<Partial<Record<Medio, number>>>({});
  const [comentario, setComentario] = useState("");
  const [pulseras, setPulseras] = useState<number | undefined>(undefined);
  const [confirmando, setConfirmando] = useState(false);
  const [aviso, setAviso] = useState(false);

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

  const faltaPlata = MEDIOS.some((m) => montos[m.clave] == null);
  const faltan = faltaPlata || (cuentaPulseras && pulseras == null);
  const sistema = (m: Medio) => (ciego ? null : (esperado?.[m] ?? null));
  const totalSistema =
    !ciego && esperado
      ? MEDIOS.reduce((s, m) => s + (esperado[m.clave] ?? 0), 0)
      : null;
  const totalContado = faltaPlata
    ? null
    : MEDIOS.reduce((s, m) => s + (montos[m.clave] ?? 0), 0);
  const diferencia =
    totalSistema != null && totalContado != null
      ? totalContado - totalSistema
      : null;

  const filaDe = (
    clave: string,
    nombreDelMedio: string,
    detalle: string,
    input: ReactNode,
    segun: number | null | undefined,
    contaste: number | undefined,
    unidades = false,
  ) => (
    <tr key={clave} className="border-t border-gray-100">
      <td className="whitespace-nowrap py-1.5 pr-2">
        <label
          htmlFor={`${idBase}-${clave}`}
          className="block text-sm text-gray-900"
        >
          {nombreDelMedio}
        </label>
        <span className="block text-xs text-gray-500">{detalle}</span>
      </td>
      {!ciego && (
        <td className="whitespace-nowrap py-1.5 pr-2 text-right text-sm text-gray-700">
          {segun == null ? (
            <span className="text-gray-400">—</span>
          ) : unidades ? (
            segun
          ) : (
            pesos(segun)
          )}
        </td>
      )}
      <td className="w-36 py-1.5">{input}</td>
      {!ciego && (
        <td className="whitespace-nowrap py-1.5 pl-2 text-right">
          <Diferencia contaste={contaste} sistema={segun} unidades={unidades} />
        </td>
      )}
    </tr>
  );

  return (
    <Seccion>
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Cerrar caja</h2>
        <p className="text-xs text-gray-500">Cierra {nombre ?? "—"}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="whitespace-nowrap pb-1 font-normal">Medio</th>
              {!ciego && <th className={th}>Según sistema</th>}
              <th className={th}>Contaste</th>
              {!ciego && <th className={th}>Diferencia</th>}
            </tr>
          </thead>
          <tbody>
            {MEDIOS.map((m) =>
              filaDe(
                m.clave,
                m.nombre,
                m.detalle,
                <Casilla falta={aviso && montos[m.clave] == null}>
                  <NumberInput
                    value={montos[m.clave]}
                    min={0}
                    currency
                    id={`${idBase}-${m.clave}`}
                    onChange={(v) => setMontos({ ...montos, [m.clave]: v })}
                    className="text-right text-sm"
                  />
                </Casilla>,
                sistema(m.clave),
                montos[m.clave],
              ),
            )}
            {cuentaPulseras &&
              filaDe(
                "pulseras",
                "Pulseras",
                "las que te quedan",
                <Casilla falta={aviso && pulseras == null}>
                  <NumberInput
                    value={pulseras}
                    min={0}
                    id={`${idBase}-pulseras`}
                    onChange={setPulseras}
                    className="text-right text-sm"
                  />
                </Casilla>,
                ciego ? null : (pulserasSegunSistema ?? null),
                pulseras,
                true,
              )}
            {!ciego && (
              <tr className="border-t-2 border-gray-200 font-semibold">
                <td className="whitespace-nowrap py-1.5 text-sm text-gray-900">
                  Total en plata
                </td>
                <td className="whitespace-nowrap py-1.5 pr-2 text-right">
                  {totalSistema == null ? "—" : pesos(totalSistema)}
                </td>
                <td className="whitespace-nowrap py-1.5 pr-3 text-right">
                  {totalContado == null ? "—" : pesos(totalContado)}
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {!ciego && diferencia != null && (
        <div
          role="status"
          className={`flex items-center justify-between rounded-lg border px-4 py-3 ${
            diferencia === 0
              ? "border-green-200 bg-green-50 text-green-700"
              : "border-red-200 bg-red-50 text-red-700"
          }`}
        >
          <span className="text-sm font-semibold">Diferencia</span>
          <span className="text-2xl font-semibold">
            {diferencia === 0
              ? "Cuadra"
              : `${diferencia < 0 ? "Faltan" : "Sobran"} ${pesos(diferencia)}`}
          </span>
        </div>
      )}
      {aviso && faltan && (
        <p className="text-xs text-red-700">
          {cuentaPulseras
            ? "Anota los cuatro montos y las pulseras: si no hay, pon 0."
            : "Anota los cuatro montos: si un medio no tuvo ventas, pon 0."}
        </p>
      )}
      <label className="block">
        <span className="text-xs text-gray-500">Comentario (opcional)</span>
        <input
          value={comentario}
          maxLength={300}
          placeholder="La máquina 2 se cortó a las 17:00"
          onChange={(e) => setComentario(e.target.value)}
          className={casilla}
        />
      </label>
      {confirmando ? (
        <div className="flex justify-end">
          <ConfirmInline
            question="¿Cerrar la caja? Después no se puede reabrir."
            yesLabel="Sí, cerrar"
            tono="normal"
            busy={cerrar.isPending}
            onYes={() => cerrar.mutate()}
            onNo={() => setConfirmando(false)}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => (faltan ? setAviso(true) : setConfirmando(true))}
          className={boton}
        >
          Cerrar caja
        </button>
      )}
    </Seccion>
  );
}
