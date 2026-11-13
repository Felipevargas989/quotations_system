import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import FileViewLink from "../../components/FileViewLink";
import Modal from "../../components/Modal";
import NumberInput from "../../components/inputs/NumberInput";
import SelectWithSearch from "../../components/selects/SelectWithSearch";
import { toast } from "../../components/toast/Toast";
import { pluralDeLaUnidad } from "../../constants/boletas";
import { MEDIOS_DE_PAGO, type MedioDePago } from "../../constants/facturacion";
import { getCaja } from "../../services/caja.service";
import {
  emitirBoletaSuelta,
  getTarifario,
  revisarBoletaSuelta,
  type LineaSuelta,
} from "../../services/boletas.service";
import type { VistaPrevia } from "../../services/facturas.service";
import { solicitarBoleta } from "../../services/solicitudes.service";
import { humanizeApiError } from "../../utils/apiErrors";
import VistaPreviaDelDte from "../postventa/facturacion/VistaPreviaDelDte";
import { RECEPTOR_VACIO } from "../postventa/facturacion/datosDeLaFactura";
import { CabeceraDelDocumento, Seccion } from "./PiezasDelDocumento";
import SolicitudesDelTurno from "./SolicitudesDelTurno";
import { LLAVE_DEL_TURNO } from "./solicitudes";

// LA BOLETA DE «NUEVO DOCUMENTO» (doc 19 §9.4, §9.16 y §9.22, sprint 3),
// en su propia pantalla como la maqueta que aprobó Felipe el 06-11:
// «Qué se cobra» (lo del tarifario por su cantidad; D3: los precios nunca a
// dedo, y la línea a mano solo del administrador), «Huésped» (la cabaña,
// que va al comienzo de cada línea) y «Pago y envío» (§9.43, 09-11): con
// qué pagó, para la caja de recepción, y el correo al que facturacion.cl le
// manda la boleta (L11), para no imprimir (Felipe: *"hay que pedir un
// correo para enviar la boleta"*). Desde el §9.45 el correo es obligatorio
// (Felipe, 09-11: *"el correo debe ser obligatorio"*): salió «Sin correo: la
// imprimo». «Crear documento» la muestra tal como saldrá (la misma revisión
// que la emite) y ahí se emite.
//
// Quien no ve la lista (recepción, de fábrica) se queda en la boleta
// después de emitir, con la última a la vista, para seguir con la próxima.
//
// §9.45 (Felipe, 09-11): recepción no emite. Arma la boleta igual y, en la
// vista previa, «Enviar solicitud» la guarda para que la emita quien tiene
// «Aprobar y emitir solicitudes»; abajo ve cómo va cada una de su turno.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
/** «Noches», «Personas»: la cantidad con el nombre de su unidad. */
const conMayuscula = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
/** Las cuatro columnas de cada línea de «Qué se cobra»: qué se cobra, la
 *  cantidad o el monto, el total y quitar. En el teléfono, una tras otra. */
const FILA =
  "flex flex-wrap items-end gap-2 sm:grid sm:grid-cols-[minmax(0,1fr)_9rem_7rem_1rem]";
const casilla =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";

interface LineaEnPantalla {
  clave: number;
  tarifarioId: string;
  cantidad?: number;
  /** Solo el administrador. */
  aMano?: boolean;
  descripcion?: string;
  monto?: number;
}

let siguiente = 1;
const lineaNueva = (aMano = false): LineaEnPantalla => ({
  clave: siguiente++,
  tarifarioId: "",
  cantidad: 1,
  aMano,
});

export interface BoletaEmitida {
  id: number;
  folio: number | null;
  total: number;
  pdf_path: string | null;
}

export default function BoletaNueva({
  esAdmin,
  conCaja = false,
  solicita = false,
  quedarse,
  onVolver,
  onEmitida,
}: {
  readonly esAdmin: boolean;
  /** §9.43: recepción emite con la caja abierta, y la boleta entra a ella. */
  readonly conCaja?: boolean;
  /** §9.45: recepción manda una solicitud en vez de emitir. */
  readonly solicita?: boolean;
  /** Sin la lista a la vista: después de emitir, otra boleta. */
  readonly quedarse: boolean;
  readonly onVolver: () => void;
  readonly onEmitida: (boleta: BoletaEmitida | null) => void;
}) {
  const queryClient = useQueryClient();
  const tarifario = useQuery({
    queryKey: ["boletas", "tarifario"],
    queryFn: getTarifario,
  });
  const activos = (tarifario.data ?? []).filter((i) => i.activo);
  const caja = useQuery({
    queryKey: ["caja"],
    queryFn: getCaja,
    enabled: conCaja,
  });
  const cajaCerrada = conCaja && caja.isSuccess && !caja.data.abierta;
  const [lineas, setLineas] = useState<LineaEnPantalla[]>(() => [lineaNueva()]);
  const [correo, setCorreo] = useState("");
  // §9.43: con qué pagó el huésped. El correo es obligatorio (§9.45,
  // Felipe 09-11: «el correo debe ser obligatorio»): ya no se imprime.
  const [medio, setMedio] = useState<MedioDePago | "">("");
  const [vista, setVista] = useState<
    (VistaPrevia & { correo: string | null }) | null
  >(null);
  const [revisando, setRevisando] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [ultima, setUltima] = useState<BoletaEmitida | null>(null);

  const itemDe = (l: LineaEnPantalla) =>
    activos.find((i) => String(i.id) === l.tarifarioId);
  const valorDe = (l: LineaEnPantalla) =>
    l.aMano ? (l.monto ?? 0) : (itemDe(l)?.precio ?? 0) * (l.cantidad ?? 0);
  const total = lineas.reduce((s, l) => s + valorDe(l), 0);
  const lista =
    lineas.length > 0 &&
    total > 0 &&
    lineas.every((l) =>
      l.aMano
        ? !!l.descripcion?.trim() && !!l.monto
        : !!itemDe(l) && (l.cantidad ?? 0) >= 1,
    );
  const correoValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim());
  const faltan = [
    !medio && "el medio de pago",
    !correoValido && "el correo para enviarle la boleta",
  ].filter((f): f is string => !!f);

  const poner = (clave: number, cambios: Partial<LineaEnPantalla>) =>
    setLineas((ls) =>
      ls.map((l) => (l.clave === clave ? { ...l, ...cambios } : l)),
    );

  const datos = () => ({
    lineas: lineas.map(
      (l): LineaSuelta =>
        l.aMano
          ? { descripcion: l.descripcion?.trim(), monto: l.monto }
          : { tarifario_id: Number(l.tarifarioId), cantidad: l.cantidad },
    ),
    // La cabaña ya no se pregunta (Felipe, 13-11-2026): quién se alojó
    // vive en Aloha. El motor la sigue aceptando; acá va siempre vacía.
    cabana: null,
    correo: correo.trim(),
    medio_de_pago: medio || null,
  });

  const crearDocumento = async () => {
    setRevisando(true);
    try {
      setVista(await revisarBoletaSuelta(datos()));
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo armar la boleta."));
    } finally {
      setRevisando(false);
    }
  };

  const limpiar = () => {
    setLineas([lineaNueva()]);
    setCorreo("");
    setMedio("");
  };

  // §9.45: la solicitud queda guardada; la emite quien aprueba.
  const enviarSolicitud = async () => {
    setEmitiendo(true);
    try {
      const s = await solicitarBoleta(datos());
      toast.success(
        `Solicitud enviada por ${clp(s.total)}: la emite quien la aprueba.`,
      );
      setVista(null);
      limpiar();
      void queryClient.invalidateQueries({ queryKey: LLAVE_DEL_TURNO });
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo enviar la solicitud."));
    } finally {
      setEmitiendo(false);
    }
  };

  const emitir = async () => {
    setEmitiendo(true);
    try {
      const r = await emitirBoletaSuelta(datos());
      if (r.boleta)
        toast.success(
          `Boleta N° ${r.boleta.folio} emitida por ${clp(r.boleta.total)}.`,
        );
      if (r.aviso) toast.warn(r.aviso, { sticky: true });
      setVista(null);
      if (quedarse) {
        setUltima(r.boleta);
        limpiar();
      }
      onEmitida(r.boleta);
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo emitir la boleta."));
    } finally {
      setEmitiendo(false);
    }
  };

  return (
    <div className="space-y-4">
      <CabeceraDelDocumento
        titulo="Nueva boleta electrónica"
        onVolver={onVolver}
      />

      {conCaja && caja.data?.abierta && (
        <p className="text-xs text-green-700">
          Caja abierta · {caja.data.abierta.abierta_por_nombre} · desde las{" "}
          {new Date(caja.data.abierta.abierta_en).toLocaleTimeString("es-CL", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      )}
      {cajaCerrada && (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          La caja de recepción está cerrada: ábrela en «Caja» para emitir.
        </p>
      )}

      {ultima && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
          Boleta N° {ultima.folio} emitida por {clp(ultima.total)}.
          {ultima.pdf_path && (
            <FileViewLink
              url={ultima.pdf_path}
              title={`Boleta ${ultima.folio}.pdf`}
            />
          )}
        </p>
      )}

      {tarifario.isPending ? (
        <p className="text-sm text-gray-400">Cargando el tarifario…</p>
      ) : activos.length === 0 && !esAdmin ? (
        <p className="text-sm text-gray-500">
          Todavía no hay tarifario: lo arma el administrador en «Tarifario».
        </p>
      ) : (
        <>
          <Seccion titulo="Qué se cobra">
            <div className="space-y-2">
              {lineas.map((l) => (
                // Cada línea en las mismas cuatro columnas (Felipe, 09-11:
                // «esto se ve raro»): qué se cobra, la cantidad o el monto,
                // el total y quitar, en el mismo lugar en la del tarifario y
                // en la escrita a mano.
                <div key={l.clave} className={FILA}>
                  {l.aMano ? (
                    <>
                      <label className="block min-w-[14rem] flex-1 sm:min-w-0">
                        <span className="flex justify-between text-xs text-gray-500">
                          Qué se cobra (a mano)
                          {Array.from(l.descripcion ?? "").length >= 60 && (
                            <span>
                              {Array.from(l.descripcion ?? "").length}/80
                            </span>
                          )}
                        </span>
                        <input
                          type="text"
                          value={l.descripcion ?? ""}
                          maxLength={80}
                          onChange={(e) =>
                            poner(l.clave, { descripcion: e.target.value })
                          }
                          className={casilla}
                        />
                      </label>
                      <label className="block w-36 sm:w-auto">
                        <span className="text-xs text-gray-500">
                          Monto con IVA
                        </span>
                        <NumberInput
                          value={l.monto}
                          min={0}
                          currency
                          placeholder="$0"
                          onChange={(v) => poner(l.clave, { monto: v })}
                          className="text-sm"
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <div className="min-w-[14rem] flex-1 sm:min-w-0">
                        <span className="text-xs text-gray-500">
                          Del tarifario
                        </span>
                        <SelectWithSearch
                          options={activos.map((i) => ({
                            value: String(i.id),
                            label: i.nombre,
                            hint: `${clp(i.precio)} por ${i.unidad}`,
                          }))}
                          value={l.tarifarioId}
                          onChange={(v) =>
                            poner(l.clave, { tarifarioId: v ?? "" })
                          }
                          placeholder="Elegir del tarifario"
                          tamano="sm"
                        />
                      </div>
                      <label className="block w-36 sm:w-auto">
                        <span className="text-xs text-gray-500">
                          {itemDe(l)
                            ? conMayuscula(
                                pluralDeLaUnidad(itemDe(l)?.unidad ?? ""),
                              )
                            : "Cantidad"}
                        </span>
                        <NumberInput
                          value={l.cantidad}
                          min={1}
                          onChange={(v) => poner(l.clave, { cantidad: v })}
                          className="text-sm"
                        />
                      </label>
                    </>
                  )}
                  <span className="w-28 pb-2 text-right text-sm text-gray-900 sm:w-auto">
                    {valorDe(l) > 0 ? (
                      clp(valorDe(l))
                    ) : (
                      <span className="text-gray-300">—</span>
                    )}
                  </span>
                  {lineas.length > 1 ? (
                    <button
                      type="button"
                      title="Quitar la línea"
                      aria-label="Quitar la línea"
                      onClick={() =>
                        setLineas((ls) => ls.filter((x) => x.clave !== l.clave))
                      }
                      className="pb-2 text-gray-400 hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  ) : (
                    // Su lugar queda vacío: las columnas no se mueven.
                    <span aria-hidden="true" />
                  )}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-4">
              {activos.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLineas((ls) => [...ls, lineaNueva()])}
                  className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:underline"
                >
                  <Plus size={13} /> Otra línea
                </button>
              )}
              {esAdmin && (
                <button
                  type="button"
                  onClick={() => setLineas((ls) => [...ls, lineaNueva(true)])}
                  className="flex items-center gap-1 text-xs font-semibold text-gray-600 hover:underline"
                >
                  <Plus size={13} /> Línea a mano (solo administración)
                </button>
              )}
            </div>
          </Seccion>

          <Seccion titulo="Pago y envío">
            <div className="grid gap-3 sm:grid-cols-2">
              <div
                role="group"
                aria-label="Medio de pago"
                className="block min-w-0"
              >
                <span className="text-xs text-gray-500">Medio de pago</span>
                <SelectWithSearch
                  options={MEDIOS_DE_PAGO.map((m) => ({
                    value: m.value,
                    label: m.label,
                  }))}
                  value={medio}
                  onChange={(v) => setMedio((v ?? "") as MedioDePago | "")}
                  placeholder="Elegir el medio de pago"
                  tamano="sm"
                  sinLimpiar
                  mostrarConteo={false}
                />
              </div>
              <div>
                <label className="block">
                  <span className="text-xs text-gray-500">
                    Correo para enviarle la boleta
                  </span>
                  <input
                    type="email"
                    value={correo}
                    placeholder="huesped@correo.cl"
                    onChange={(e) => setCorreo(e.target.value)}
                    className={casilla}
                  />
                </label>
              </div>
            </div>
            <dl className="ml-auto grid w-full grid-cols-2 gap-x-3 text-sm sm:w-64">
              <dt className="font-semibold text-gray-900">Total a pagar</dt>
              <dd className="text-right font-semibold text-gray-900">
                {clp(total)}
              </dd>
            </dl>
            {lista && faltan.length > 0 && (
              <p className="text-right text-xs text-red-600">
                Falta {faltan.join(" y ")}.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onVolver}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={
                  !lista || faltan.length > 0 || cajaCerrada || revisando
                }
                onClick={() => void crearDocumento()}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {revisando ? "Revisando…" : "Crear documento"}
              </button>
            </div>
          </Seccion>
        </>
      )}

      {vista && (
        <Modal
          titulo="Así sale la boleta"
          ancho="max-w-3xl"
          bloquearEscape={emitiendo}
          onCerrar={() => !emitiendo && setVista(null)}
        >
          <VistaPreviaDelDte
            vista={vista}
            pedida={{
              tipo: 39,
              receptor: { ...RECEPTOR_VACIO, correo: vista.correo },
              referencias: [],
            }}
            puedeEmitir
            emitiendo={emitiendo}
            solicita={solicita}
            onVolver={() => setVista(null)}
            onEmitir={() => void (solicita ? enviarSolicitud() : emitir())}
          />
        </Modal>
      )}

      {solicita && <SolicitudesDelTurno />}
    </div>
  );
}
