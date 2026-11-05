import { useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import { toast } from "../../../components/toast/Toast";
import RutInput from "../../../components/inputs/RutInput";
import SelectWithSearch from "../../../components/selects/SelectWithSearch";
import {
  LARGO_MAXIMO,
  nombreDeReferencia,
} from "../../../constants/facturacion";
import {
  armarBorradorDeFactura,
  emitirFactura,
  revisarFactura,
  type BorradorDeFactura,
  type FacturaPedida,
  type Receptor,
  type ReferenciaPedida,
} from "../../../services/facturas.service";
import { humanizeApiError } from "../../../utils/apiErrors";
import { fechaCorta } from "../../../utils/ordenesDeCompra";
import { formatearRut } from "../../../utils/rut";
import EditarFacturaAMano from "./EditarFacturaAMano";
import Casilla from "./CasillaDeLaFactura";
import {
  DEL_RECEPTOR,
  OTRA,
  RECEPTOR_VACIO,
  useQuieto,
} from "./datosDeLaFactura";
import VistaPreviaDeFactura from "./VistaPreviaDeFactura";

// LA FACTURA QUE ARMA BELIA (doc 19 §9.2, paso 2c; maqueta del 04-11).
//
// Felipe: "Belia arma todo y luego se confirma a mano". Desde la OC (o desde
// el evento): de dónde leyó, el total de la OC con lo ya facturado, el
// receptor, el detalle, el neto y el IVA, y las referencias. Lo que falta se
// pregunta acá mismo (CCU: la nota de pedido; un RUT nuevo: el giro) y lo
// que se responde queda en la ficha al emitir. «Editar a mano» abre todo
// (E4), «Ver cómo sale» muestra la factura tal como saldrá y ahí se emite.
// La revisión es la del motor: la misma que emite.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
function Cifra({
  titulo,
  valor,
  detalle,
}: {
  readonly titulo: string;
  readonly valor: string;
  readonly detalle?: string;
}) {
  return (
    <div className="rounded-lg bg-white px-3 py-2 border border-gray-200">
      <p className="text-xs text-gray-500">{titulo}</p>
      <p className="text-base font-semibold text-gray-900">{valor}</p>
      {detalle && <p className="text-xs text-gray-500">{detalle}</p>}
    </div>
  );
}

function Fila({
  titulo,
  children,
}: {
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="grid gap-1 py-2 sm:grid-cols-[9rem_1fr]">
      <dt className="text-xs font-semibold text-gray-500">{titulo}</dt>
      <dd className="text-sm text-gray-900 break-words">{children}</dd>
    </div>
  );
}

const DeDonde = ({ children }: { readonly children: ReactNode }) => (
  <span className="text-xs text-gray-500"> {children}</span>
);

export default function ArmarFactura({
  quotationId,
  ordenDeCompraId,
  puedeEmitir,
  onCerrar,
  onEmitida,
}: {
  readonly quotationId: string;
  readonly ordenDeCompraId: number | null;
  readonly puedeEmitir: boolean;
  readonly onCerrar: () => void;
  readonly onEmitida: () => void;
}) {
  const borrador = useQuery({
    queryKey: ["facturacion", "borrador", quotationId, ordenDeCompraId],
    queryFn: () => armarBorradorDeFactura(quotationId, ordenDeCompraId),
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-4">
      {borrador.isPending ? (
        <p className="flex items-center gap-2 text-sm text-violet-700">
          <Sparkles size={14} /> BelIA está armando la factura…
        </p>
      ) : borrador.isError ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-red-600">
            {humanizeApiError(
              borrador.error,
              "BelIA no pudo armar la factura.",
            )}
          </p>
          <button
            type="button"
            onClick={onCerrar}
            className="text-xs font-semibold text-gray-500 hover:text-gray-700"
          >
            Cerrar
          </button>
        </div>
      ) : (
        <Borrador
          inicial={borrador.data}
          quotationId={quotationId}
          puedeEmitir={puedeEmitir}
          onCerrar={onCerrar}
          onEmitida={onEmitida}
        />
      )}
    </div>
  );
}

function Borrador({
  inicial,
  quotationId,
  puedeEmitir,
  onCerrar,
  onEmitida,
}: {
  readonly inicial: BorradorDeFactura;
  readonly quotationId: string;
  readonly puedeEmitir: boolean;
  readonly onCerrar: () => void;
  readonly onEmitida: () => void;
}) {
  const [pedida, setPedida] = useState<FacturaPedida>(inicial.pedida);
  const [editando, setEditando] = useState(false);
  const [viendo, setViendo] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [otra, setOtra] = useState(false);

  const quieta = useQuieto(pedida);
  const cambio = quieta !== inicial.pedida;
  const revision = useQuery({
    queryKey: ["facturacion", "revisar", quotationId, quieta],
    queryFn: () => revisarFactura(quotationId, quieta),
    enabled: cambio,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  const vista = cambio && revision.data ? revision.data : inicial.vista;
  const revisando = pedida !== quieta || revision.isFetching;

  const r = pedida.receptor;
  const conOC = !!inicial.oc;
  const quien =
    inicial.origenes.receptor === "ficha"
      ? (inicial.evento.cliente ?? r.razon_social)
      : r.razon_social || "El cliente";
  // Lo que se pregunta queda a la vista aunque ya se haya respondido: si
  // no, la casilla se iría mientras se escribe.
  const [preguntadas] = useState(
    () =>
      new Set(
        inicial.pedida.referencias.filter((x) => !x.folio).map((x) => x.tipo),
      ),
  );
  const [faltabanDelReceptor, setFaltaban] = useState(() =>
    inicial.origenes.receptor === "persona"
      ? []
      : DEL_RECEPTOR.filter((c) => !inicial.pedida.receptor[c.campo]),
  );
  // Sin RUT en la OC (o sin OC): se elige entre las razones sociales del
  // cliente, o se escribe una nueva.
  const sinReceptor = inicial.origenes.receptor === "persona";
  const elegirLaRazon = sinReceptor && inicial.razones.length > 0;
  const escribirReceptor =
    otra || (sinReceptor && inicial.razones.length === 0);

  const poner = (cambios: Partial<FacturaPedida>) =>
    setPedida((p) => ({ ...p, ...cambios }));
  const ponerReceptor = (campo: keyof Receptor, valor: string) =>
    setPedida((p) => ({ ...p, receptor: { ...p.receptor, [campo]: valor } }));
  const ponerReferencia = (i: number, cambios: Partial<ReferenciaPedida>) =>
    setPedida((p) => ({
      ...p,
      referencias: p.referencias.map((x, j) =>
        j === i ? { ...x, ...cambios } : x,
      ),
    }));
  const siempre = (codigo: string, si: boolean) =>
    setPedida((p) => ({
      ...p,
      pedir_siempre: si
        ? [...new Set([...p.pedir_siempre, codigo])]
        : p.pedir_siempre.filter((c) => c !== codigo),
    }));
  const elegirRazon = (rut: string) => {
    const elegida = inicial.razones.find((x) => x.rut === rut);
    setOtra(rut === OTRA);
    setFaltaban(elegida ? DEL_RECEPTOR.filter((c) => !elegida[c.campo]) : []);
    setPedida((p) => ({
      ...p,
      receptor: elegida
        ? {
            rut: elegida.rut,
            razon_social: elegida.razon_social,
            giro: elegida.giro,
            direccion: elegida.direccion,
            comuna: elegida.comuna,
            ciudad: elegida.ciudad,
            correo: elegida.correo_facturacion,
          }
        : RECEPTOR_VACIO,
      // Las referencias que pide la razón social elegida.
      referencias: (elegida?.referencias_exigidas ?? []).map(
        (c) =>
          p.referencias.find((x) => x.tipo === c) ?? {
            tipo: c,
            folio: "",
            fecha: "",
          },
      ),
      pedir_siempre: [...(elegida?.referencias_exigidas ?? [])],
    }));
  };

  const emitir = async () => {
    setEmitiendo(true);
    try {
      const doc = await emitirFactura(quotationId, pedida);
      if (doc.estado === "por_confirmar")
        toast.warn(
          "Se cortó la conexión con facturacion.cl: la factura queda por confirmar. No la emitas de nuevo.",
          { sticky: true },
        );
      else
        toast.success(
          `Factura N° ${doc.folio} emitida${doc.ambiente === "simulado" ? " (simulada)" : ""}.`,
        );
      onEmitida();
    } catch (error) {
      toast.error(humanizeApiError(error, "No se pudo emitir la factura."));
    } finally {
      setEmitiendo(false);
    }
  };

  if (viendo)
    return (
      <VistaPreviaDeFactura
        vista={vista}
        pedida={pedida}
        puedeEmitir={puedeEmitir}
        emitiendo={emitiendo || revisando}
        onVolver={() => setViendo(false)}
        onEmitir={emitir}
      />
    );

  const base = inicial.oc ? inicial.oc.total : inicial.evento.total;
  const facturado = inicial.oc
    ? inicial.oc.facturado
    : inicial.evento.facturado;
  const pct = (n: number) =>
    base > 0
      ? `${(Math.round((n / base) * 1000) / 10).toLocaleString("es-CL")} %`
      : "—";
  const total = vista.montos?.total ?? 0;
  const cuadra =
    conOC && facturado === 0 && total === inicial.oc?.total && !revisando;
  const faltan = vista.faltan.length;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-violet-900">
            <Sparkles size={14} /> Borrador de factura armado por BelIA
          </p>
          <p className="text-xs text-gray-500">
            Leído de: {inicial.leidoDe.join(" · ")}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {revisando ? (
            <span className="text-xs text-gray-400">Revisando…</span>
          ) : faltan > 0 ? (
            <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
              Falta {faltan} {faltan === 1 ? "dato" : "datos"}
            </span>
          ) : vista.ok ? (
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-800">
              Lista para emitir
            </span>
          ) : null}
          <button
            type="button"
            onClick={onCerrar}
            title="Cerrar sin emitir"
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <Cifra
          titulo={conOC ? "Total de la OC" : "Total del evento"}
          valor={clp(base)}
        />
        <Cifra
          titulo={conOC ? "Ya facturado de la OC" : "Ya facturado del evento"}
          valor={clp(facturado)}
          detalle={pct(facturado)}
        />
        <Cifra titulo="Esta factura" valor={pct(total)} detalle={clp(total)} />
      </div>

      {editando ? (
        <EditarFacturaAMano
          pedida={pedida}
          inicial={inicial}
          totalActual={total}
          otra={otra}
          elegirLaRazon={elegirLaRazon}
          poner={poner}
          ponerReceptor={ponerReceptor}
          ponerReferencia={ponerReferencia}
          siempre={siempre}
          elegirRazon={elegirRazon}
        />
      ) : (
        <>
          <dl className="divide-y divide-gray-100 rounded-lg bg-white px-3 border border-gray-200">
            <Fila titulo="Receptor">
              {r.razon_social ? (
                <>
                  {r.razon_social}
                  {r.rut ? ` · RUT ${formatearRut(r.rut)}` : ""}
                  <DeDonde>
                    {inicial.origenes.receptor === "ficha"
                      ? "· giro, dirección y correo de la ficha"
                      : inicial.origenes.receptor === "orden_de_compra"
                        ? "· como dice la OC: queda en la ficha al emitir"
                        : ""}
                  </DeDonde>
                </>
              ) : (
                <span className="text-gray-400">Falta elegirlo</span>
              )}
            </Fila>
            <Fila titulo="Detalle">
              {pedida.detalle.descripcion}
              <DeDonde>
                {inicial.origenes.detalle === "orden_de_compra"
                  ? "(como dice la OC)"
                  : "(de la cotización)"}
              </DeDonde>
              {pedida.detalle.descripcion_larga && (
                <span className="block text-xs text-gray-500">
                  {pedida.detalle.descripcion_larga}
                </span>
              )}
            </Fila>
            <Fila titulo="Neto · IVA">
              {vista.montos
                ? `${clp(vista.montos.neto)} · ${clp(vista.montos.iva)}`
                : "—"}
              {cuadra && <DeDonde>(cuadra con la OC)</DeDonde>}
            </Fila>
            {pedida.referencias
              .filter((x) => !preguntadas.has(x.tipo))
              .map((x) => (
                <Fila key={x.tipo} titulo={`Referencia ${x.tipo}`}>
                  {nombreDeReferencia(x.tipo)} {x.folio}
                  {x.fecha ? ` · ${fechaCorta(x.fecha)}` : ""}
                </Fila>
              ))}
          </dl>

          {elegirLaRazon && !r.rut && !otra && (
            <Pregunta>
              <p>¿A cuál razón social de {quien} va la factura?</p>
              <SelectWithSearch
                options={[
                  ...inicial.razones.map((x) => ({
                    value: x.rut,
                    label: x.razon_social,
                    hint: formatearRut(x.rut),
                  })),
                  { value: OTRA, label: "Otra razón social…" },
                ]}
                value=""
                onChange={(v) => v && elegirRazon(v)}
                placeholder="Elegir la razón social"
                tamano="sm"
              />
            </Pregunta>
          )}
          {escribirReceptor && (
            <Pregunta>
              <p>
                ¿A quién se factura? Queda en la ficha del cliente al emitir.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <RutInput
                  value={r.rut}
                  onChange={(rut) => ponerReceptor("rut", rut)}
                  placeholder="RUT"
                  className="text-sm"
                />
                <Casilla
                  etiqueta="Razón social"
                  valor={r.razon_social}
                  largo={LARGO_MAXIMO.razon_social}
                  onChange={(v) => ponerReceptor("razon_social", v)}
                />
              </div>
            </Pregunta>
          )}

          {(faltabanDelReceptor.length > 0 || escribirReceptor) && (
            <Pregunta>
              <p>
                Para facturar a {r.razon_social || "este receptor"} el SII pide{" "}
                {conOC ? "lo que no trae la OC" : "estos datos"}. Queda en la
                ficha al emitir.
              </p>
              <div className="grid gap-2 sm:grid-cols-3">
                {(escribirReceptor ? DEL_RECEPTOR : faltabanDelReceptor).map(
                  (c) => (
                    <Casilla
                      key={c.campo}
                      etiqueta={c.nombre}
                      valor={r[c.campo]}
                      largo={c.largo}
                      onChange={(v) => ponerReceptor(c.campo, v)}
                    />
                  ),
                )}
              </div>
            </Pregunta>
          )}

          {pedida.referencias.map((x, i) =>
            preguntadas.has(x.tipo) ? (
              <Pregunta key={x.tipo}>
                <p>
                  {quien} pide también la{" "}
                  {nombreDeReferencia(x.tipo).toLowerCase()} (referencia{" "}
                  {x.tipo}){conOC ? ", y no viene en la orden de compra" : ""}.
                </p>
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="text"
                    value={x.folio}
                    maxLength={18}
                    placeholder="N°"
                    onChange={(e) =>
                      ponerReferencia(i, { folio: e.target.value })
                    }
                    className="w-44 px-2 py-1 text-sm border border-gray-300 rounded-lg"
                  />
                  <input
                    type="date"
                    value={x.fecha}
                    onChange={(e) =>
                      ponerReferencia(i, { fecha: e.target.value })
                    }
                    className="px-2 py-1 text-sm border border-gray-300 rounded-lg"
                  />
                  <label className="flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={pedida.pedir_siempre.includes(x.tipo)}
                      onChange={(e) => siempre(x.tipo, e.target.checked)}
                    />
                    Pedírmela siempre en las facturas de {quien}
                  </label>
                </div>
              </Pregunta>
            ) : null,
          )}
        </>
      )}

      {(vista.avisos.length > 0 || vista.problemas.length > 0) && (
        <div className="space-y-0.5 text-xs">
          {vista.avisos.map((a) => (
            <p key={a} className="text-gray-600">
              • {a}
            </p>
          ))}
          {vista.problemas.map((p) => (
            <p key={p} className="text-red-600">
              • {p}
            </p>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setEditando((e) => !e)}
          className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs rounded-lg font-semibold hover:bg-gray-50"
        >
          {editando ? "Listo" : "Editar a mano"}
        </button>
        <button
          type="button"
          onClick={() => setViendo(true)}
          className="px-3 py-1.5 bg-blue-600 text-white text-xs rounded-lg font-semibold hover:bg-blue-700"
        >
          Ver cómo sale
        </button>
      </div>
    </div>
  );
}

const Pregunta = ({ children }: { readonly children: ReactNode }) => (
  <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
    {children}
  </div>
);
