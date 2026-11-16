import { useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import Modal from "../../components/Modal";
import NumberInput from "../../components/inputs/NumberInput";
import { toast } from "../../components/toast/Toast";
import {
  entregarPulseras,
  getPulseras,
  type ResumenDePulseras,
} from "../../services/pulseras.service";
import { humanizeApiError } from "../../utils/apiErrors";
import ChipDePulseras from "./ChipDePulseras";
import { Seccion } from "./PiezasDelDocumento";

// LAS PULSERAS (doc 19 §9.49; Felipe, 16-11: *"paso 100 u otra cantidad de
// pulseras a recepción y llevar un control de stock para saber que lo que
// se ha vendido es lo que se ha cobrado"*). «Lo vendido» sigue en su
// propia pestaña, al lado. Arriba las cuatro cifras; abajo el
// movimiento: las entregas y cada turno con lo vendido y lo contado.
// Permiso «Pulseras» (`facturacion_vendido`): ver y entregar.

const LLAVE_PULSERAS = ["pulseras"] as const;

const fecha = (iso: string) =>
  new Date(iso).toLocaleString("es-CL", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Santiago",
  });

function Cifra({
  titulo,
  valor,
  children,
}: {
  readonly titulo: string;
  readonly valor: number | null;
  readonly children?: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <span className="block text-xs text-gray-500">{titulo}</span>
      <span className="block text-2xl font-semibold text-gray-900">
        {valor == null ? "—" : valor.toLocaleString("es-CL")}
      </span>
      {children}
    </div>
  );
}

type Movimiento =
  | { tipo: "entrega"; en: string; id: number; cantidad: number; por: string }
  | { tipo: "directa"; en: string; clave: string; pulseras: number }
  | {
      tipo: "turno";
      en: string;
      turno: ResumenDePulseras["turnos"][number];
    };

const movimientos = (r: ResumenDePulseras): Movimiento[] =>
  [
    ...r.entregas.map(
      (e): Movimiento => ({
        tipo: "entrega",
        en: e.creada_en,
        id: e.id,
        cantidad: e.cantidad,
        por: e.por,
      }),
    ),
    ...r.ventas_directas.map(
      (v, i): Movimiento => ({
        tipo: "directa",
        en: v.created_at,
        clave: `d${i}`,
        pulseras: v.pulseras,
      }),
    ),
    ...r.turnos.map(
      (t): Movimiento => ({
        tipo: "turno",
        en: t.cerrada_en ?? t.abierta_en,
        turno: t,
      }),
    ),
  ].sort((a, b) => Date.parse(b.en) - Date.parse(a.en));

function EntregarPulseras({ onCerrar }: { readonly onCerrar: () => void }) {
  const queryClient = useQueryClient();
  const [cantidad, setCantidad] = useState<number | undefined>(undefined);
  const valida = cantidad != null && Number.isInteger(cantidad) && cantidad > 0;
  const entregar = useMutation({
    mutationFn: () => entregarPulseras(cantidad ?? 0),
    onSuccess: (datos) => {
      queryClient.setQueryData(LLAVE_PULSERAS, datos);
      toast.success(`${cantidad} pulseras entregadas a recepción.`);
      onCerrar();
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo anotar la entrega.")),
  });
  return (
    <Modal
      titulo="Entregar pulseras"
      subtitulo="A recepción"
      ancho="max-w-sm"
      onCerrar={onCerrar}
      pie={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCerrar}
            className="px-3 py-2 text-sm text-gray-600 hover:underline"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!valida || entregar.isPending}
            onClick={() => entregar.mutate()}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {entregar.isPending ? "Guardando…" : "Entregar"}
          </button>
        </div>
      }
    >
      <label className="block">
        <span className="text-xs text-gray-500">Cuántas</span>
        <NumberInput
          value={cantidad}
          min={1}
          placeholder="100"
          onChange={setCantidad}
          className="text-sm"
        />
      </label>
    </Modal>
  );
}

export default function Pulseras() {
  const pulseras = useQuery({ queryKey: LLAVE_PULSERAS, queryFn: getPulseras });
  const [entregando, setEntregando] = useState(false);
  const r = pulseras.data;

  if (pulseras.isPending)
    return <p className="text-sm text-gray-400">Contando las pulseras…</p>;
  if (pulseras.isError || !r)
    return (
      <p className="text-sm text-red-600">No se pudieron traer las pulseras.</p>
    );

  if (!r.usa_pulsera)
    return (
      <div className="space-y-4">
        <Seccion titulo="Pulseras">
          <p className="text-sm text-gray-500">
            Ningún ítem del tarifario usa pulsera. Préndelo en Tarifario.
          </p>
        </Seccion>
      </div>
    );

  const lista = movimientos(r);
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-gray-900">Pulseras</h2>
        <button
          type="button"
          onClick={() => setEntregando(true)}
          className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Entregar pulseras
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra titulo="Entregadas" valor={r.entregadas} />
        <Cifra titulo="Vendidas" valor={r.vendidas} />
        <Cifra titulo="Deberían quedar" valor={r.deberian_quedar} />
        <Cifra titulo="Contadas" valor={r.contadas}>
          {r.diferencia != null && r.contadas_en && (
            <span className="mt-1 flex flex-wrap items-center gap-1.5">
              <ChipDePulseras diferencia={r.diferencia} />
              <span className="text-xs text-gray-500">
                {fecha(r.contadas_en)}
              </span>
            </span>
          )}
        </Cifra>
      </div>

      <Seccion titulo="Movimiento">
        {lista.length === 0 ? (
          <p className="text-sm text-gray-500">Sin entregas todavía.</p>
        ) : (
          <table className="w-full table-fixed text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500">
                <th className="w-[45%] pb-1 font-normal">Qué</th>
                <th className="pb-1 text-right font-normal">Pulseras</th>
                <th className="pb-1 text-right font-normal">Conteo</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((m) =>
                m.tipo === "directa" ? (
                  <tr key={m.clave} className="border-t border-gray-100">
                    <td className="py-1.5">
                      <span className="block truncate">Venta directa</span>
                      <span className="block truncate text-xs text-gray-500">
                        {fecha(m.en)}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">−{m.pulseras}</td>
                    <td />
                  </tr>
                ) : m.tipo === "entrega" ? (
                  <tr key={`e${m.id}`} className="border-t border-gray-100">
                    <td className="py-1.5">
                      <span className="block truncate">Entrega</span>
                      <span className="block truncate text-xs text-gray-500">
                        {m.por} · {fecha(m.en)}
                      </span>
                    </td>
                    <td className="py-1.5 text-right font-medium text-green-700">
                      +{m.cantidad}
                    </td>
                    <td />
                  </tr>
                ) : (
                  <tr
                    key={`t${m.turno.id}`}
                    className="border-t border-gray-100"
                  >
                    <td className="py-1.5">
                      <span className="block truncate">
                        Turno de {m.turno.abierta_por_nombre}
                      </span>
                      <span className="block truncate text-xs text-gray-500">
                        {m.turno.cerrada_en
                          ? `Cerró ${fecha(m.turno.cerrada_en)}`
                          : "Abierta"}
                      </span>
                    </td>
                    <td className="py-1.5 text-right">
                      {m.turno.vendidas > 0 ? `−${m.turno.vendidas}` : "0"}
                    </td>
                    <td className="py-1.5 text-right">
                      {m.turno.diferencia != null &&
                      m.turno.deberian != null ? (
                        <span className="inline-flex flex-col items-end">
                          <ChipDePulseras diferencia={m.turno.diferencia} />
                          <span className="text-xs text-gray-500">
                            {m.turno.contadas} de {m.turno.deberian}
                          </span>
                        </span>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        )}
      </Seccion>

      {entregando && <EntregarPulseras onCerrar={() => setEntregando(false)} />}
    </div>
  );
}
