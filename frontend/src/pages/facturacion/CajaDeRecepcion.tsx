import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import NumberInput from "../../components/inputs/NumberInput";
import { toast } from "../../components/toast/Toast";
import {
  abrirCaja,
  getCaja,
  type CajaAbierta,
  type CierreEnLaLista,
} from "../../services/caja.service";
import { humanizeApiError } from "../../utils/apiErrors";
import CadenaDelEfectivo from "./CadenaDelEfectivo";
import CajaCerrada from "./CajaCerrada";
import CierresDeCaja from "./CierresDeCaja";
import PanelDeLaCajaAbierta from "./PanelDeLaCajaAbierta";
import { Seccion } from "./PiezasDelDocumento";

// LA PESTAÑA CAJA (doc 19 §9.43; desde el §9.55, la caja abierta es una
// fila). Felipe, 16-11: *"recepción igual debe pinchar la caja abierta para
// cerrarla, finalmente es mover la misma sección pero dentro del modal"*.
//
// - Sin caja abierta, quien la opera ve arriba solo «Abrir caja» con su
//   sencillo (a nombre del perfil de la sesión, §9.43). Recién cerrada, el
//   check de `CajaCerrada` (§9.47).
// - La caja abierta es la primera fila de la lista; al pincharla se abre su
//   panel (`PanelDeLaCajaAbierta`): quién y con cuánto abrió, los
//   movimientos y el cierre.
// - Quien revisa los cierres ve la cadena del efectivo entera
//   (`CierresDeCaja`, §9.54). Los demás, solo la fila de la caja abierta,
//   sin nada de lo que dice el sistema: el cierre sigue ciego.

const titulo = "text-xs text-gray-500";
const boton =
  "rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50";

/** La caja abierta como fila de la lista (sin nada del sistema). */
const comoFila = (a: CajaAbierta): CierreEnLaLista => ({
  id: a.id,
  abierta_por_nombre: a.abierta_por_nombre,
  abierta_en: a.abierta_en,
  sencillo_inicial: a.sencillo_inicial,
  cerrada_por_nombre: null,
  cerrada_en: null,
  revisado_por_nombre: null,
  revisado_en: null,
  estado: "abierta",
  vendido: 0,
  declarado: null,
  diferencia: null,
  diferencias: [],
});

export default function CajaDeRecepcion({
  nombre,
  puedeAbrirYCerrar = true,
  puedeRevisar = false,
  puedeAnotar = false,
  puedeGastar = false,
  puedeVerPulseras = false,
}: {
  /** El perfil de la sesión: abre y cierra a su nombre (Felipe, 09-11:
   *  «que no sea escrito a mano»). */
  readonly nombre: string | null;
  /** «Caja de recepción». */
  readonly puedeAbrirYCerrar?: boolean;
  /** «Revisar cierres de caja». */
  readonly puedeRevisar?: boolean;
  /** «Anotar movimientos de caja». */
  readonly puedeAnotar?: boolean;
  /** §9.56: «Anotar gastos de caja». */
  readonly puedeGastar?: boolean;
  /** «Lo vendido»: quien además revisa ve las pulseras que deberían
   *  quedar al cerrar. */
  readonly puedeVerPulseras?: boolean;
}) {
  const queryClient = useQueryClient();
  // El estado ciego: lo pide quien opera la caja o anota movimientos.
  const veLaCaja = puedeAbrirYCerrar || puedeAnotar || puedeGastar;
  const caja = useQuery({
    queryKey: ["caja"],
    queryFn: getCaja,
    enabled: veLaCaja,
  });
  const abierta = caja.data?.abierta ?? null;
  const [sencillo, setSencillo] = useState<number | undefined>(undefined);
  const [cerradaEn, setCerradaEn] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);

  const abrir = useMutation({
    mutationFn: () => abrirCaja({ sencillo: sencillo ?? 0 }),
    onSuccess: (datos) => {
      queryClient.setQueryData(["caja"], datos);
      void queryClient.invalidateQueries({ queryKey: ["caja", "cierres"] });
      setCerradaEn(null);
      setSencillo(undefined);
    },
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo abrir la caja.")),
  });

  if (veLaCaja && caja.isPending)
    return <p className="text-sm text-gray-400">Cargando la caja…</p>;

  const arriba =
    !abierta && cerradaEn ? (
      <CajaCerrada
        cerradaEn={cerradaEn}
        nombre={nombre}
        alAbrirOtra={() => setCerradaEn(null)}
      />
    ) : !abierta && puedeAbrirYCerrar ? (
      <div className="flex flex-wrap items-end gap-3 rounded-lg border border-gray-200 bg-white p-4">
        <label className="block w-48">
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
        <button
          type="button"
          disabled={sencillo == null || abrir.isPending}
          onClick={() => abrir.mutate()}
          className={boton}
        >
          {abrir.isPending ? "Abriendo…" : "Abrir caja"}
        </button>
        <span className="text-xs text-gray-500">Abre {nombre ?? "—"}</span>
      </div>
    ) : null;

  return (
    <div className="space-y-4">
      {arriba}
      {puedeRevisar ? (
        <CierresDeCaja
          onAbrirLaCaja={abierta ? () => setPanel(true) : undefined}
        />
      ) : (
        abierta && (
          <Seccion titulo="Caja de recepción">
            <CadenaDelEfectivo
              lista={[comoFila(abierta)]}
              ciego
              onAbrir={() => setPanel(true)}
            />
          </Seccion>
        )
      )}
      {panel && abierta && (
        <PanelDeLaCajaAbierta
          abierta={abierta}
          nombre={nombre}
          cuentaPulseras={caja.data?.cuenta_pulseras === true}
          puedeCerrar={puedeAbrirYCerrar}
          puedeAnotar={puedeAnotar}
          puedeGastar={puedeGastar}
          puedeRevisar={puedeRevisar}
          puedeVerPulseras={puedeVerPulseras}
          onCerrar={() => setPanel(false)}
          onCerrada={(en) => {
            setPanel(false);
            setCerradaEn(en);
          }}
        />
      )}
    </div>
  );
}
