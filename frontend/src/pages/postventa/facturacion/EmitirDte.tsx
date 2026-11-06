import { useState, type ReactNode } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Sparkles, X } from "lucide-react";
import { toast } from "../../../components/toast/Toast";
import SelectWithSearch from "../../../components/selects/SelectWithSearch";
import {
  LARGO_MAXIMO,
  nombreDeReferencia,
  marcaDelAmbiente,
} from "../../../constants/facturacion";
import {
  armarBorradorDeDte,
  emitirDte,
  prepararDte,
  revisarDte,
  type BorradorDelDte,
  type DtePedido,
  type PreparacionDelDte,
  type Receptor,
  type ReferenciaPedida,
  type TipoDeDte,
} from "../../../services/facturas.service";
import { humanizeApiError } from "../../../utils/apiErrors";
import { fechaCorta } from "../../../utils/ordenesDeCompra";
import { formatearRut } from "../../../utils/rut";
import Casilla, { CasillaDelRut } from "./CasillaDeLaFactura";
import {
  DEL_RECEPTOR,
  OTRA,
  RECEPTOR_VACIO,
  useQuieto,
} from "./datosDeLaFactura";
import EditarReceptor from "./EditarReceptor";
import LineasDelDte from "./LineasDelDte";
import VistaPreviaDelDte from "./VistaPreviaDelDte";

// EMITIR DTE (doc 19 §9.20): la factura o la boleta del evento.
//
// Felipe, 05-11: *"puedo elegir si el DTE es una factura, una boleta y
// punto (…) el DTE tiene una descripción, un precio neto, un precio, una
// cantidad de personas, un precio total, el IVA y el total a pagar. Eso o
// se completa solo de la orden de compra o se completa de la información
// que tiene Eventia, o bien se edita a mano"*. Al abrir, BelIA lee las OC
// que están en Documentos; el DTE se llena desde la OC que queda por
// facturar, o desde la cotización. Lo que falta se pregunta acá mismo (CCU:
// la nota de pedido; un RUT nuevo: el giro) y queda en la ficha al emitir.
// «Ver cómo sale» muestra el DTE tal como saldrá y ahí se emite. La
// revisión es la del motor: la misma que emite.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;

const NOMBRE: Record<TipoDeDte, string> = { 33: "Factura", 39: "Boleta" };

export default function EmitirDte({
  quotationId,
  puedeEmitir,
  onCerrar,
  onEmitido,
}: {
  readonly quotationId: string;
  readonly puedeEmitir: boolean;
  readonly onCerrar: () => void;
  readonly onEmitido: () => void;
}) {
  const preparacion = useQuery({
    queryKey: ["facturacion", "preparar", quotationId],
    queryFn: () => prepararDte(quotationId),
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  return (
    <div className="space-y-3 rounded-lg border border-violet-200 bg-violet-50/40 p-4">
      {preparacion.isPending ? (
        <p className="flex items-center gap-2 text-sm text-violet-700">
          <Sparkles size={14} /> BelIA está leyendo las órdenes de compra de
          Documentos…
        </p>
      ) : preparacion.isError ? (
        <Falla error={preparacion.error} onCerrar={onCerrar} />
      ) : (
        <ConLaPreparacion
          preparacion={preparacion.data}
          quotationId={quotationId}
          puedeEmitir={puedeEmitir}
          onCerrar={onCerrar}
          onEmitido={onEmitido}
        />
      )}
    </div>
  );
}

function Falla({
  error,
  onCerrar,
}: {
  readonly error: unknown;
  readonly onCerrar: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <p className="text-sm text-red-600">
        {humanizeApiError(error, "BelIA no pudo armar el DTE.")}
      </p>
      <button
        type="button"
        onClick={onCerrar}
        className="text-xs font-semibold text-gray-500 hover:text-gray-700"
      >
        Cerrar
      </button>
    </div>
  );
}

/** Factura o boleta, y de dónde se llena: una OC o la cotización. */
function ConLaPreparacion({
  preparacion,
  quotationId,
  puedeEmitir,
  onCerrar,
  onEmitido,
}: {
  readonly preparacion: PreparacionDelDte;
  readonly quotationId: string;
  readonly puedeEmitir: boolean;
  readonly onCerrar: () => void;
  readonly onEmitido: () => void;
}) {
  const [tipo, setTipo] = useState<TipoDeDte>(preparacion.tipo);
  // La primera OC que queda por facturar; si no hay, la cotización.
  const [desde, setDesde] = useState<number | null>(
    () => preparacion.ocs.find((o) => o.facturado < o.total)?.id ?? null,
  );
  // La boleta no va contra una OC.
  const oc = tipo === 33 ? desde : null;
  const borrador = useQuery({
    queryKey: ["facturacion", "borrador", quotationId, tipo, oc],
    queryFn: () => armarBorradorDeDte(quotationId, tipo, oc),
    gcTime: 0,
    refetchOnWindowFocus: false,
  });
  const ev = preparacion.evento;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-gray-300 bg-white p-0.5">
          {([33, 39] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTipo(t)}
              className={`rounded-md px-3 py-1 text-xs font-semibold ${tipo === t ? "bg-violet-600 text-white" : "text-gray-600 hover:bg-gray-50"}`}
            >
              {NOMBRE[t]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onCerrar}
          title="Cerrar sin emitir"
          className="text-gray-400 hover:text-gray-600"
        >
          <X size={16} />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-gray-500">Se llena desde</span>
        {tipo === 33 &&
          preparacion.ocs.map((o) => (
            <Fuente
              key={o.id}
              elegida={desde === o.id}
              onClick={() => setDesde(o.id)}
              titulo={`OC N° ${o.numero}`}
              queda={o.total - o.facturado}
            />
          ))}
        <Fuente
          elegida={oc === null}
          onClick={() => setDesde(null)}
          titulo={`Cotización N° ${ev.numero}`}
          queda={ev.total - ev.facturado}
        />
      </div>

      {preparacion.sin_leer.length > 0 && (
        <div className="space-y-0.5 rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
          <p className="font-semibold">
            BelIA no pudo leer estas órdenes de compra de Documentos:
          </p>
          {preparacion.sin_leer.map((s) => (
            <p key={s.documento_id}>
              • «{s.nombre}»: {s.motivo.replace(/\.$/, "")}.
            </p>
          ))}
        </div>
      )}

      {borrador.isPending ? (
        <p className="flex items-center gap-2 text-sm text-violet-700">
          <Sparkles size={14} /> BelIA está armando el DTE…
        </p>
      ) : borrador.isError ? (
        <Falla error={borrador.error} onCerrar={onCerrar} />
      ) : (
        <Borrador
          key={`${tipo}-${oc ?? "cotizacion"}`}
          inicial={borrador.data}
          quotationId={quotationId}
          puedeEmitir={puedeEmitir}
          onEmitido={onEmitido}
        />
      )}
    </div>
  );
}

function Fuente({
  elegida,
  onClick,
  titulo,
  queda,
}: {
  readonly elegida: boolean;
  readonly onClick: () => void;
  readonly titulo: string;
  readonly queda: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-2.5 py-0.5 font-semibold ${elegida ? "border-violet-600 bg-violet-600 text-white" : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"}`}
    >
      {titulo}
      <span className="font-normal">
        {" "}
        · {queda > 0 ? `queda ${clp(queda)}` : "emitida completa"}
      </span>
    </button>
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

function Borrador({
  inicial,
  quotationId,
  puedeEmitir,
  onEmitido,
}: {
  readonly inicial: BorradorDelDte;
  readonly quotationId: string;
  readonly puedeEmitir: boolean;
  readonly onEmitido: () => void;
}) {
  const [pedida, setPedida] = useState<DtePedido>(inicial.pedida);
  const [editando, setEditando] = useState(false);
  const [viendo, setViendo] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [otra, setOtra] = useState(false);

  const quieta = useQuieto(pedida);
  const cambio = quieta !== inicial.pedida;
  const revision = useQuery({
    queryKey: ["facturacion", "revisar", quotationId, quieta],
    queryFn: () => revisarDte(quotationId, quieta),
    enabled: cambio,
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  const vista = cambio && revision.data ? revision.data : inicial.vista;
  const revisando = pedida !== quieta || revision.isFetching;

  const factura = pedida.tipo === 33;
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
  const sinReceptor = factura && inicial.origenes.receptor === "persona";
  const elegirLaRazon = sinReceptor && inicial.razones.length > 0;
  const escribirReceptor =
    otra || (sinReceptor && inicial.razones.length === 0);

  const poner = (cambios: Partial<DtePedido>) =>
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
    const cual = factura ? "factura" : "boleta";
    try {
      const doc = await emitirDte(quotationId, pedida);
      if (doc.estado === "por_confirmar")
        toast.warn(
          `Se cortó la conexión con facturacion.cl: la ${cual} queda por confirmar. No la emitas de nuevo.`,
          { sticky: true },
        );
      else
        toast.success(
          `${NOMBRE[pedida.tipo]} N° ${doc.folio} emitida${marcaDelAmbiente(doc.ambiente)}.`,
        );
      onEmitido();
    } catch (error) {
      toast.error(humanizeApiError(error, `No se pudo emitir la ${cual}.`));
    } finally {
      setEmitiendo(false);
    }
  };

  if (viendo)
    return (
      <VistaPreviaDelDte
        vista={vista}
        pedida={pedida}
        puedeEmitir={puedeEmitir}
        emitiendo={emitiendo || revisando}
        onVolver={() => setViendo(false)}
        onEmitir={emitir}
      />
    );

  const faltan = vista.faltan.length;

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-0.5">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-violet-900">
            <Sparkles size={14} /> {NOMBRE[pedida.tipo]} armada por BelIA
          </p>
          <p className="text-xs text-gray-500">
            Leído de: {inicial.leidoDe.join(" · ")}
          </p>
        </div>
        <div className="shrink-0">
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
        </div>
      </div>

      {factura && editando && (
        <EditarReceptor
          pedida={pedida}
          inicial={inicial}
          otra={otra}
          elegirLaRazon={elegirLaRazon}
          poner={poner}
          ponerReceptor={ponerReceptor}
          ponerReferencia={ponerReferencia}
          siempre={siempre}
          elegirRazon={elegirRazon}
        />
      )}

      {factura && !editando && (
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
                <CasillaDelRut
                  valor={r.rut}
                  onChange={(rut) => ponerReceptor("rut", rut)}
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

      <LineasDelDte
        lineas={pedida.lineas}
        montos={vista.montos}
        onChange={(lineas) => poner({ lineas })}
      />

      {!factura && (
        <Casilla
          etiqueta="Correo del cliente (facturacion.cl le manda la boleta)"
          valor={r.correo}
          largo={LARGO_MAXIMO.correo_facturacion}
          onChange={(v) => ponerReceptor("correo", v)}
        />
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
        {factura && (
          <button
            type="button"
            onClick={() => setEditando((e) => !e)}
            className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs rounded-lg font-semibold hover:bg-gray-50"
          >
            {editando ? "Listo" : "Editar receptor y referencias"}
          </button>
        )}
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
