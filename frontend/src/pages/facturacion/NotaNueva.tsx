import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import Modal from "../../components/Modal";
import NumberInput from "../../components/inputs/NumberInput";
import { toast } from "../../components/toast/Toast";
import { LARGO_MAXIMO } from "../../constants/facturacion";
import {
  emitirNota,
  getListaDeFacturacion,
  revisarNota,
  type AccionDeNota,
  type DocumentoDeLaLista,
  type NotaEmitida,
  type NotaPedida,
  type VistaDeLaNota,
} from "../../services/documentosTributarios.service";
import type { VistaPrevia } from "../../services/facturas.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { hoyEnChile, hoyEnChileMas } from "../../utils/dates";
import { fechaCorta } from "../../utils/ordenesDeCompra";
import { matchesSearch } from "../../utils/searchMatch";
import VistaPreviaDelDte from "../postventa/facturacion/VistaPreviaDelDte";
import { RECEPTOR_VACIO } from "../postventa/facturacion/datosDeLaFactura";
import { admiteLaNota, type TipoDeNota } from "./admiteLaNota";
import { CabeceraDelDocumento, Seccion } from "./PiezasDelDocumento";

// LAS NOTAS DE «NUEVO DOCUMENTO» (doc 19 §9.5 y §9.22, sprint 3), en su
// propia pantalla como la maqueta que aprobó Felipe el 06-11. Una nota
// siempre modifica UN documento: primero se elige cuál (buscando por N° o
// cliente entre las facturas y las notas del último año que la admiten; lo
// que admite cada uno lo dice el motor), y después cómo:
// - de una factura, la nota de crédito: «Anular completa» (código 1),
//   «Rebajar un monto» (código 3, nunca más de lo que le queda) o
//   «Corregir un texto» (código 2, en $0, con lo que debe decir);
// - de una nota de crédito, la de débito que la anula; de una de débito,
//   la de crédito que la anula.
// «Crear documento» la muestra tal como saldrá (la misma revisión que la
// emite, con el plazo del SII) y ahí se emite. Desde la lista, «Anular o
// rebajar…» llega con el documento ya elegido.

const clp = (n: number) =>
  `${n < 0 ? "−" : ""}$${Math.abs(Math.round(n)).toLocaleString("es-CL")}`;
const casilla =
  "w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent";
const soloRut = (s: string) => s.replace(/[^0-9kK]/g, "").toUpperCase();

const OPCIONES: { accion: AccionDeNota; titulo: string; detalle: string }[] = [
  {
    accion: "anular",
    titulo: "Anular completa",
    detalle: "NC por el total · código 1",
  },
  {
    accion: "rebajar",
    titulo: "Rebajar un monto",
    detalle: "NC parcial · código 3",
  },
  {
    accion: "corregir",
    titulo: "Corregir un texto",
    detalle: "NC en $0 · código 2",
  },
];

/** Cómo lo dice la nota, como la maqueta. */
const QUE_HACE: Record<number, string> = {
  1: "Anula",
  2: "Corrige el texto de",
  3: "Corrige el monto de",
};
const LO_QUE_MODIFICA: Record<string, string> = {
  "33": "la factura electrónica",
  "56": "la nota de débito electrónica",
  "61": "la nota de crédito electrónica",
};
const NOMBRE_DEL_DOCUMENTO: Record<number, string> = {
  33: "La factura",
  56: "La nota de débito",
  61: "La nota de crédito",
};

/** La nota como la dibuja la vista previa de la casa (`VistaPreviaDelDte`). */
const comoVista = (v: VistaDeLaNota): VistaPrevia => ({
  ok: v.ok,
  montos: v.montos,
  lineas: v.lineas.map((l) => ({
    ...l,
    descripcionLarga: l.descripcionLarga ?? null,
  })),
  observaciones: [],
  avisos: v.avisos,
  problemas: v.problemas,
  faltan: [],
  folio: v.folio,
  fecha: v.fecha,
  emisor: v.emisor,
  ambiente: v.ambiente,
  pago: null,
});

const referenciaDe = (v: VistaDeLaNota) =>
  `${QUE_HACE[v.referencia.codigo] ?? "Modifica"} ${LO_QUE_MODIFICA[v.referencia.tipo] ?? "el documento"} N° ${v.referencia.folio} del ${fechaCorta(v.referencia.fecha)} · ${v.referencia.razon}`;

export default function NotaNueva({
  tipo,
  inicial = null,
  onVolver,
  onEmitida,
}: {
  readonly tipo: TipoDeNota;
  /** El documento ya elegido (desde la lista: «Anular o rebajar…»). */
  readonly inicial?: DocumentoDeLaLista | null;
  readonly onVolver: () => void;
  readonly onEmitida: (nota: NotaEmitida) => void;
}) {
  const credito = tipo === "nota_credito";
  const nombre = credito ? "nota de crédito" : "nota de débito";
  const [doc, setDoc] = useState<DocumentoDeLaLista | null>(inicial);
  const [busqueda, setBusqueda] = useState("");
  // Lo primero que el motor le ofrece al documento (una rebajada ya no se
  // anula entera: se rebaja lo que le queda).
  const [accion, setAccion] = useState<AccionDeNota>(
    () => OPCIONES.find((o) => inicial?.acciones[o.accion])?.accion ?? "anular",
  );
  const [motivo, setMotivo] = useState("");
  const [monto, setMonto] = useState<number | undefined>(undefined);
  const [receptor, setReceptor] = useState({
    razon_social: "",
    giro: "",
    direccion: "",
    comuna: "",
  });
  const [vista, setVista] = useState<VistaDeLaNota | null>(null);
  const [revisando, setRevisando] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);

  // Lo que se puede modificar: las facturas y las notas del último año.
  const hoy = hoyEnChile();
  const desde = hoyEnChileMas(-365);
  const lista = useQuery({
    queryKey: ["facturacion", "lista", "para-notas", desde, hoy],
    queryFn: () =>
      getListaDeFacturacion({ desde, hasta: hoy, tipos: [33, 56, 61] }),
    enabled: !doc,
  });
  const q = busqueda.trim();
  const elegibles = (lista.data?.documentos ?? [])
    .filter((d) => admiteLaNota(tipo, d))
    .filter(
      (d) =>
        !q ||
        (d.folio != null && String(d.folio).includes(q)) ||
        matchesSearch(q, d.cliente, d.titulo) ||
        (soloRut(q).length >= 3 &&
          !!d.rut &&
          soloRut(d.rut).includes(soloRut(q))),
    )
    .sort(
      (a, b) =>
        (b.fecha_emision ?? "").localeCompare(a.fecha_emision ?? "") ||
        b.id - a.id,
    );

  const elegir = (d: DocumentoDeLaLista | null) => {
    setDoc(d);
    setVista(null);
    setMonto(undefined);
    // Lo primero que el motor le ofrece a ese documento.
    const primera = d
      ? OPCIONES.find((o) => d.acciones[o.accion])?.accion
      : undefined;
    setAccion(primera ?? "anular");
  };

  const opciones = doc
    ? OPCIONES.filter((o) => doc.tipo === 33 && doc.acciones[o.accion])
    : [];
  const saldo = doc?.saldo ?? doc?.total ?? 0;
  const faltan = [
    ...(!motivo.trim() ? ["el motivo"] : []),
    ...(accion === "rebajar" && !(monto && monto > 0 && monto <= saldo)
      ? [`un monto entre $1 y ${clp(saldo)}`]
      : []),
  ];

  const nota = (): NotaPedida => ({
    accion,
    motivo: motivo.trim(),
    monto: accion === "rebajar" ? (monto ?? null) : null,
    receptor:
      accion === "corregir"
        ? Object.fromEntries(
            Object.entries(receptor).filter(([, v]) => v.trim()),
          )
        : null,
  });

  const crearDocumento = async () => {
    if (!doc) return;
    setRevisando(true);
    try {
      setVista(await revisarNota(doc.id, nota()));
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo armar la nota."));
    } finally {
      setRevisando(false);
    }
  };

  const emitir = async () => {
    if (!doc) return;
    setEmitiendo(true);
    try {
      const r = await emitirNota(doc.id, nota());
      if (r.estado === "por_confirmar")
        toast.warn(
          "Se cortó la conexión con facturacion.cl: la nota queda por confirmar. No la emitas de nuevo.",
          { sticky: true },
        );
      else
        toast.success(
          `${credito ? "Nota de crédito" : "Nota de débito"} N° ${r.folio} emitida.`,
        );
      setVista(null);
      onEmitida(r);
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo emitir la nota."));
    } finally {
      setEmitiendo(false);
    }
  };

  const plazo =
    doc?.plazos &&
    (accion === "rebajar"
      ? `Para rebajar, el SII da 6 meses: hasta el ${fechaCorta(doc.plazos.rebajar)}.`
      : `Para ${accion === "anular" ? "anular" : "corregir"}, el SII da este mes o el siguiente: hasta el ${fechaCorta(doc.plazos.anular)}.`);

  return (
    <div className="space-y-4">
      <CabeceraDelDocumento
        titulo={`Nueva ${nombre}`}
        folio={vista?.folio ?? null}
        onVolver={onVolver}
      />

      {!doc ? (
        <Seccion
          titulo={
            credito ? "¿Qué factura modifica?" : "¿Qué nota de crédito anula?"
          }
        >
          <label className="relative block">
            <span className="sr-only">Buscar</span>
            <Search
              size={14}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
            />
            <input
              type="search"
              value={busqueda}
              placeholder="Buscar por N° o cliente"
              autoComplete="off"
              onChange={(e) => setBusqueda(e.target.value)}
              className={`${casilla} pl-8`}
            />
          </label>
          {lista.isPending ? (
            <p className="text-sm text-gray-400">Cargando…</p>
          ) : elegibles.length === 0 ? (
            <p className="text-sm text-gray-500">
              No hay documentos para modificar con esa búsqueda.
            </p>
          ) : (
            <div className="max-h-96 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
              {elegibles.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => elegir(d)}
                  className="flex w-full flex-wrap items-baseline justify-between gap-x-3 px-3 py-2 text-left hover:bg-blue-50"
                >
                  <span className="text-sm font-semibold text-gray-900">
                    {d.titulo}
                    <span className="font-normal text-gray-600">
                      {" "}
                      · {d.cliente ?? "—"}
                    </span>
                  </span>
                  <span className="text-xs text-gray-500">
                    {d.fecha_emision ? fechaCorta(d.fecha_emision) : "—"} ·{" "}
                    {clp(d.total)}
                  </span>
                </button>
              ))}
            </div>
          )}
        </Seccion>
      ) : (
        <Seccion titulo={NOMBRE_DEL_DOCUMENTO[doc.tipo] ?? "El documento"}>
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-gray-50 px-3 py-2 text-sm">
            <span>
              <span className="font-semibold text-gray-900">{doc.titulo}</span>{" "}
              · {doc.cliente ?? "—"} ·{" "}
              {doc.fecha_emision ? fechaCorta(doc.fecha_emision) : "—"}
            </span>
            <span className="flex items-center gap-3">
              <span className="font-semibold text-gray-900">
                {clp(doc.total)}
              </span>
              <button
                type="button"
                onClick={() => elegir(null)}
                className="text-xs font-semibold text-blue-600 hover:underline"
              >
                Cambiar
              </button>
            </span>
          </div>

          {opciones.length > 0 ? (
            <div className="grid gap-2 sm:grid-cols-3">
              {opciones.map((o) => (
                <button
                  key={o.accion}
                  type="button"
                  aria-pressed={accion === o.accion}
                  onClick={() => {
                    setAccion(o.accion);
                    setVista(null);
                  }}
                  className={`rounded-lg border px-3 py-2 text-left text-sm ${accion === o.accion ? "border-blue-600 bg-white ring-2 ring-blue-200" : "border-gray-200 bg-white hover:border-gray-300"}`}
                >
                  <span className="block font-semibold text-gray-900">
                    {o.titulo}
                  </span>
                  <span className="block text-xs text-gray-500">
                    {o.detalle}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <p className="text-xs text-gray-600">
              {credito
                ? "La nota de crédito anula la nota de débito."
                : "La nota de débito anula la nota de crédito: la factura vuelve a quedar como estaba."}
            </p>
          )}

          {accion === "rebajar" && (
            <label className="block max-w-xs">
              <span className="text-xs text-gray-500">
                Monto a rebajar (con IVA)
              </span>
              <NumberInput
                value={monto}
                min={0}
                currency
                placeholder="0"
                onChange={(v) => {
                  setMonto(v);
                  setVista(null);
                }}
                className="text-sm"
              />
              <span className="mt-1 block text-xs text-gray-400">
                Queda {clp(saldo)} por rebajar.
              </span>
            </label>
          )}

          {accion === "corregir" && (
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["razon_social", "Razón social", LARGO_MAXIMO.razon_social],
                  ["giro", "Giro", LARGO_MAXIMO.giro],
                  ["direccion", "Dirección", LARGO_MAXIMO.direccion],
                  ["comuna", "Comuna", LARGO_MAXIMO.comuna],
                ] as const
              ).map(([campo, etiqueta, largo]) => (
                <label key={campo} className="block">
                  <span className="flex justify-between text-xs text-gray-500">
                    {etiqueta}, como debe decir (si cambia)
                    <span>
                      {Array.from(receptor[campo]).length}/{largo}
                    </span>
                  </span>
                  <input
                    type="text"
                    value={receptor[campo]}
                    maxLength={largo}
                    onChange={(e) => {
                      setReceptor({ ...receptor, [campo]: e.target.value });
                      setVista(null);
                    }}
                    className={casilla}
                  />
                </label>
              ))}
            </div>
          )}

          <label className="block">
            <span className="flex justify-between text-xs text-gray-500">
              Motivo (va en la nota)
              <span>{Array.from(motivo).length}/90</span>
            </span>
            <input
              type="text"
              value={motivo}
              maxLength={90}
              placeholder={
                accion === "rebajar"
                  ? "Ej.: Vinieron 20 personas menos"
                  : accion === "corregir"
                    ? "Ej.: El giro correcto es Elaboración de cervezas"
                    : "Ej.: Se emitió con el RUT equivocado"
              }
              onChange={(e) => {
                setMotivo(e.target.value);
                setVista(null);
              }}
              className={casilla}
            />
          </label>

          {plazo && <p className="text-xs text-gray-600">{plazo}</p>}

          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-amber-800">
              {faltan.length > 0 && `Falta ${faltan.join(" y ")}.`}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onVolver}
                className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={faltan.length > 0 || revisando}
                onClick={() => void crearDocumento()}
                className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {revisando ? "Revisando…" : "Crear documento"}
              </button>
            </div>
          </div>
        </Seccion>
      )}

      {vista && (
        <Modal
          titulo={`Así sale la ${nombre}`}
          ancho="max-w-3xl"
          bloquearEscape={emitiendo}
          onCerrar={() => !emitiendo && setVista(null)}
        >
          <VistaPreviaDelDte
            vista={comoVista(vista)}
            pedida={{
              tipo: vista.tipo,
              receptor: { ...RECEPTOR_VACIO, ...vista.receptor },
              referencias: [],
            }}
            referencia={referenciaDe(vista)}
            puedeEmitir
            emitiendo={emitiendo}
            onVolver={() => setVista(null)}
            onEmitir={() => void emitir()}
          />
        </Modal>
      )}
    </div>
  );
}
