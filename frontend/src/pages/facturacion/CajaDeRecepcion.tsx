import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ConfirmInline from "../../components/ConfirmInline";
import NumberInput from "../../components/inputs/NumberInput";
import { toast } from "../../components/toast/Toast";
import {
  abrirCaja,
  anotarRetiro,
  cerrarCaja,
  getCaja,
} from "../../services/caja.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { Seccion } from "./PiezasDelDocumento";

// LA CAJA DE RECEPCIÓN, DEL LADO DE QUIEN LA OPERA (doc 19 §9.43, sprint 2;
// la maqueta del 09-11, «ok hazlo así»). Se abre con quién y el sencillo,
// se anotan los retiros y se cierra a ciegas: quien cierra anota cuánto
// tiene en efectivo, débito, crédito y transferencia, sin ver lo esperado
// ni la diferencia (lo revisa el administrador en «Cierres de la caja»). Cerrada, no
// se reabre.

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

const MEDIOS = [
  { clave: "efectivo", label: "Efectivo contado (con el sencillo)" },
  { clave: "debito", label: "Débito (resumen de la máquina)" },
  { clave: "credito", label: "Crédito (resumen de la máquina)" },
  { clave: "transferencia", label: "Transferencias (comprobantes)" },
] as const;
type Medio = (typeof MEDIOS)[number]["clave"];

export default function CajaDeRecepcion() {
  const queryClient = useQueryClient();
  const caja = useQuery({ queryKey: ["caja"], queryFn: getCaja });
  const abierta = caja.data?.abierta ?? null;

  const [quienAbre, setQuienAbre] = useState("");
  const [sencillo, setSencillo] = useState<number | undefined>(undefined);
  const [retiro, setRetiro] = useState<{
    monto?: number;
    motivo: string;
  } | null>(null);
  const [montos, setMontos] = useState<Partial<Record<Medio, number>>>({});
  const [quienCierra, setQuienCierra] = useState("");
  const [comentario, setComentario] = useState("");
  const [confirmando, setConfirmando] = useState(false);
  const [cerradaEn, setCerradaEn] = useState<string | null>(null);

  const alDia = (datos: Awaited<ReturnType<typeof getCaja>>) =>
    queryClient.setQueryData(["caja"], datos);
  const error = (e: unknown, texto: string) =>
    toast.error(humanizeApiError(e, texto));

  const abrir = useMutation({
    mutationFn: () =>
      abrirCaja({ quien: quienAbre.trim(), sencillo: sencillo ?? 0 }),
    onSuccess: (datos) => {
      alDia(datos);
      setCerradaEn(null);
      setQuienCierra(quienAbre.trim());
      setQuienAbre("");
      setSencillo(undefined);
    },
    onError: (e) => error(e, "No se pudo abrir la caja."),
  });

  const guardarRetiro = useMutation({
    mutationFn: () =>
      anotarRetiro({
        monto: retiro?.monto ?? 0,
        motivo: retiro?.motivo.trim() ?? "",
      }),
    onSuccess: (datos) => {
      alDia(datos);
      setRetiro(null);
    },
    onError: (e) => error(e, "No se pudo anotar el retiro."),
  });

  const cerrar = useMutation({
    mutationFn: () =>
      cerrarCaja({
        quien: quienCierra.trim(),
        efectivo: montos.efectivo ?? 0,
        debito: montos.debito ?? 0,
        credito: montos.credito ?? 0,
        transferencia: montos.transferencia ?? 0,
        comentario: comentario.trim() || null,
      }),
    onSuccess: (r) => {
      setCerradaEn(r.cerrada_en);
      setConfirmando(false);
      setMontos({});
      setComentario("");
      alDia({ abierta: null });
      void queryClient.invalidateQueries({ queryKey: ["caja", "cierres"] });
    },
    onError: (e) => {
      setConfirmando(false);
      error(e, "No se pudo cerrar la caja.");
    },
  });

  if (caja.isPending)
    return <p className="text-sm text-gray-400">Cargando la caja…</p>;

  if (!abierta) {
    const lista = !!quienAbre.trim() && sencillo != null;
    return (
      <div className="space-y-4">
        {cerradaEn && (
          <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
            Caja cerrada a las {hora(cerradaEn)}. La revisa el administrador.
          </p>
        )}
        <Seccion titulo="Abrir la caja de recepción">
          <p className="text-xs text-gray-500">
            Sin la caja abierta, recepción no emite boletas.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className={titulo}>¿Quién abre?</span>
              <input
                value={quienAbre}
                maxLength={60}
                onChange={(e) => setQuienAbre(e.target.value)}
                className={casilla}
              />
            </label>
            <label className="block">
              <span className={titulo}>Sencillo inicial</span>
              <NumberInput
                value={sencillo}
                min={0}
                currency
                onChange={setSencillo}
                placeholder="$0"
                className="text-sm"
              />
            </label>
          </div>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!lista || abrir.isPending}
              onClick={() => abrir.mutate()}
              className={boton}
            >
              {abrir.isPending ? "Abriendo…" : "Abrir caja"}
            </button>
          </div>
        </Seccion>
      </div>
    );
  }

  const faltan = MEDIOS.filter((m) => montos[m.clave] == null).length;
  const listaParaCerrar = faltan === 0 && !!quienCierra.trim();
  return (
    <div className="space-y-4">
      <p className="text-sm">
        <span className="mr-2 inline-block rounded-full border border-green-200 bg-green-50 px-2 py-0.5 text-xs font-semibold text-green-700">
          Abierta
        </span>
        <span className="text-gray-600">
          Caja de recepción · abrió {abierta.abierta_por_nombre} a las{" "}
          {hora(abierta.abierta_en)} · sencillo {clp(abierta.sencillo_inicial)}
        </span>
      </p>

      <Seccion titulo="Retiros del turno">
        {abierta.retiros.length === 0 ? (
          <p className="text-xs text-gray-400">Sin retiros.</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {abierta.retiros.map((r) => (
              <li key={r.id} className="flex justify-between py-1.5">
                <span>
                  {hora(r.creado_en)} · {r.motivo}
                </span>
                <span>{clp(r.monto)}</span>
              </li>
            ))}
          </ul>
        )}
        {retiro ? (
          <div className="flex flex-wrap items-end gap-2">
            <label className="block w-36">
              <span className={titulo}>Monto</span>
              <NumberInput
                value={retiro.monto}
                min={1}
                currency
                onChange={(v) => setRetiro({ ...retiro, monto: v })}
                className="text-sm"
              />
            </label>
            <label className="block min-w-[12rem] flex-1">
              <span className={titulo}>Motivo</span>
              <input
                value={retiro.motivo}
                maxLength={120}
                placeholder="Entregado a administración"
                onChange={(e) =>
                  setRetiro({ ...retiro, motivo: e.target.value })
                }
                className={casilla}
              />
            </label>
            <button
              type="button"
              disabled={
                !retiro.monto ||
                !retiro.motivo.trim() ||
                guardarRetiro.isPending
              }
              onClick={() => guardarRetiro.mutate()}
              className={boton}
            >
              Guardar
            </button>
            <button
              type="button"
              onClick={() => setRetiro(null)}
              className="px-2 py-2 text-sm text-gray-600 hover:underline"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setRetiro({ motivo: "" })}
            className="text-xs font-semibold text-blue-600 hover:underline"
          >
            + Anotar retiro
          </button>
        )}
      </Seccion>

      <Seccion titulo="Cerrar caja: ¿cuánto tienes?">
        <div className="grid gap-3 sm:grid-cols-2">
          {MEDIOS.map((m) => (
            <label key={m.clave} className="block">
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
          ))}
          <label className="block">
            <span className={titulo}>Quién cierra</span>
            <input
              value={quienCierra}
              maxLength={60}
              onChange={(e) => setQuienCierra(e.target.value)}
              className={casilla}
            />
          </label>
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
            Anota los cuatro montos: si un medio no tuvo ventas, pon 0.
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
              disabled={!listaParaCerrar}
              onClick={() => setConfirmando(true)}
              className={boton}
            >
              Cerrar caja
            </button>
          )}
        </div>
      </Seccion>
    </div>
  );
}
