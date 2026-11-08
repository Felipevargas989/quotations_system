import { useState } from "react";
import { FileDown } from "lucide-react";
import NumberInput from "../../components/inputs/NumberInput";
import { toast } from "../../components/toast/Toast";
import {
  traerFactura,
  type FacturaTraida,
} from "../../services/documentosTributarios.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatearRut } from "../../utils/rut";
import { CabeceraDelDocumento, Seccion } from "./PiezasDelDocumento";

// TRAER UNA FACTURA EMITIDA FUERA DE EVENTIA (doc 19 §9.36). Felipe, 08-11,
// con las N° 374 y 375 de Santo Tomás, hechas en la página de
// facturacion.cl: *"¿podrás traer estas facturas para hacer las notas de
// crédito desde acá?"* y *"ok vamos con la 2"*. Se escribe el N°, Eventia
// le pide su PDF a facturacion.cl y lo lee; se mira lo leído y «Traer a
// Eventia» la deja en Documentos, marcada «traída», para anularla o
// rebajarla con su nota como cualquier otra. También la nota de crédito
// (Felipe, 08-11: *"tráete las notas de crédito y las facturas"*): queda
// anulando o rebajando su factura, que ya tiene que estar en Eventia.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const fecha = (iso: string) => iso.split("-").reverse().join("-");
const NOMBRE = { 33: "Factura", 61: "Nota de crédito" } as const;
const DEL_DOCUMENTO: Record<string, string> = {
  "33": "la factura",
  "34": "la factura exenta",
  "39": "la boleta",
  "56": "la nota de débito",
};
const claseBoton =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50";

export default function TraerFactura({
  onVolver,
  onTraida,
}: {
  readonly onVolver: () => void;
  /** La traída y su fecha: la lista la marca, desde su mes. */
  readonly onTraida: (id: number, fecha: string) => void;
}) {
  const [tipo, setTipo] = useState<33 | 61>(33);
  const [folio, setFolio] = useState<number | undefined>(undefined);
  const [leida, setLeida] = useState<FacturaTraida | null>(null);
  const [ocupado, setOcupado] = useState<"leer" | "traer" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const leer = async () => {
    if (!folio) return;
    setOcupado("leer");
    setError(null);
    setLeida(null);
    try {
      setLeida((await traerFactura(folio, false, tipo)).factura);
    } catch (e) {
      setError(humanizeApiError(e, "No se pudo leer ese documento."));
    } finally {
      setOcupado(null);
    }
  };

  const traer = async () => {
    if (!leida) return;
    setOcupado("traer");
    setError(null);
    try {
      const r = await traerFactura(leida.folio, true, tipo);
      toast.success(
        tipo === 61
          ? `Nota de crédito N° ${leida.folio} traída.`
          : `Factura N° ${leida.folio} traída: ya puedes anularla desde Documentos.`,
      );
      if (r.guardada) onTraida(r.guardada.id, leida.fecha_emision);
    } catch (e) {
      setError(humanizeApiError(e, "No se pudo traer ese documento."));
    } finally {
      setOcupado(null);
    }
  };

  const oc = leida?.referencias.find((r) => r.tipo === "801");
  const modifica = leida?.modifica;
  const tipoBoton = (k: 33 | 61) => (
    <button
      type="button"
      aria-pressed={tipo === k}
      onClick={() => {
        setTipo(k);
        setLeida(null);
        setError(null);
      }}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold ${tipo === k ? "bg-blue-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
    >
      {NOMBRE[k]}
    </button>
  );
  return (
    <div className="space-y-4">
      <CabeceraDelDocumento
        titulo="Traer factura o nota de crédito emitida fuera de Eventia"
        onVolver={onVolver}
      />
      <Seccion>
        <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
          {tipoBoton(33)}
          {tipoBoton(61)}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <label className="block w-48">
            <span className="mb-1 block text-xs text-gray-500">
              {tipo === 61 ? "N° de la nota de crédito" : "N° de la factura"}
            </span>
            <NumberInput
              value={folio}
              min={1}
              placeholder="374"
              onChange={(v) => {
                setFolio(v);
                setLeida(null);
                setError(null);
              }}
              className="text-sm"
            />
          </label>
          <button
            type="button"
            onClick={() => void leer()}
            disabled={!folio || ocupado != null}
            className={`${claseBoton} border border-gray-300 bg-white text-gray-700 hover:bg-gray-50`}
          >
            {ocupado === "leer" ? "Leyendo…" : "Leer de facturacion.cl"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600">{error}</p>}
      </Seccion>

      {leida && (
        <>
          <Seccion
            titulo={`${NOMBRE[tipo]} N° ${leida.folio} · ${fecha(leida.fecha_emision)}`}
          >
            <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-3">
              <div className="sm:col-span-2">
                <dt className="text-xs text-gray-500">Razón social</dt>
                <dd className="text-gray-900">
                  {leida.receptor.razon_social}
                  {leida.nombre_del_sii && (
                    <span className="block text-xs text-gray-500">
                      Completo según el SII: facturacion.cl lo cortó en su PDF
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">RUT</dt>
                <dd className="text-gray-900">
                  {formatearRut(leida.receptor.rut)}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-gray-500">Giro</dt>
                <dd className="text-gray-900">{leida.receptor.giro ?? "—"}</dd>
              </div>
              {modifica ? (
                <div>
                  <dt className="text-xs text-gray-500">Modifica</dt>
                  <dd className="text-gray-900">
                    {`${modifica.que_hace.charAt(0).toUpperCase()}${modifica.que_hace.slice(1)} ${DEL_DOCUMENTO[modifica.tipo] ?? "el documento"} N° ${modifica.folio} del ${fecha(modifica.fecha)}`}
                  </dd>
                </div>
              ) : (
                <div>
                  <dt className="text-xs text-gray-500">OC</dt>
                  <dd className="text-gray-900">
                    {oc ? `${oc.folio} · ${fecha(oc.fecha)}` : "—"}
                  </dd>
                </div>
              )}
              <div>
                <dt className="text-xs text-gray-500">Evento</dt>
                <dd className="text-gray-900">
                  {leida.evento?.cotizacion
                    ? `#${leida.evento.cotizacion}`
                    : "Sin evento en Eventia"}
                </dd>
              </div>
            </dl>
          </Seccion>

          <Seccion titulo="Ítems">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500">
                  <th className="py-1 font-medium">Descripción</th>
                  <th className="py-1 text-right font-medium">Cantidad</th>
                  <th className="py-1 text-right font-medium">Precio neto</th>
                  <th className="py-1 text-right font-medium">Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {leida.lineas.map((l, i) => (
                  <tr key={i}>
                    <td className="py-1.5 pr-2 text-gray-900">
                      {l.descripcion}
                      {l.descripcionLarga && (
                        <span className="block text-xs text-gray-500">
                          {l.descripcionLarga}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {l.cantidad.toLocaleString("es-CL")}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {clp(l.precio)}
                    </td>
                    <td className="py-1.5 text-right tabular-nums">
                      {clp(l.cantidad * l.precio)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <dl className="ml-auto grid w-64 grid-cols-2 gap-y-1 text-sm">
              <dt className="text-gray-500">Neto</dt>
              <dd className="text-right tabular-nums">{clp(leida.neto)}</dd>
              <dt className="text-gray-500">IVA 19 %</dt>
              <dd className="text-right tabular-nums">{clp(leida.iva)}</dd>
              <dt className="font-semibold text-gray-900">Total</dt>
              <dd className="text-right font-semibold tabular-nums text-gray-900">
                {clp(leida.total)}
              </dd>
            </dl>
          </Seccion>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void traer()}
              disabled={ocupado != null}
              className={`${claseBoton} bg-blue-600 text-white hover:bg-blue-700`}
            >
              <FileDown size={15} />
              {ocupado === "traer" ? "Trayendo…" : "Traer a Eventia"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
