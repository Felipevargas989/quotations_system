import { useState } from "react";
import { useQueries } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Sparkles,
} from "lucide-react";
import Modal from "../../components/Modal";
import { toast } from "../../components/toast/Toast";
import { marcaDelAmbiente } from "../../constants/facturacion";
import {
  emitirDte,
  type DocumentoTributario,
  type EventoPorFacturar,
  type OcSinLeer,
} from "../../services/facturas.service";
import { humanizeApiError } from "../../utils/apiErrors";
import CorregirDte, { type EnCorreccion } from "./CorregirDte";
import DocumentoDelDte from "./DocumentoDelDte";
import LoDelEvento from "./LoDelEvento";
import {
  loQueLeFalta,
  revisarUnoParaLaMasiva,
  type RevisadoParaLaMasiva,
} from "./revisarUnoParaLaMasiva";

// «FACTURAR SELECCIONADOS» DE «POR FACTURAR» (doc 19 §9.31; Felipe, 08-11:
// *"ahí debería desplegarse un modal con la misma estructura de documento
// (…) así puedo revisar una por una (como cuando reviso los pagos, con la
// flecha arriba con un botón de corregir y un botón de aprobar) y luego al
// final pinchar el facturar todas"*; vio la maqueta y dijo *"sí, así"*).
// Reemplaza a la facturación masiva de §9.21:
// - BelIA arma el documento de cada evento marcado como «Emitir DTE» al
//   abrirse (`revisarUnoParaLaMasiva`: sus OC, factura o boleta, desde la
//   OC con saldo o la cotización).
// - Se revisan uno por uno, con las flechas arriba («2 de 5»), como los
//   días de las fichas en Personas. Arriba, «Lo del evento» (sus OC y lo
//   que hay que mirar); abajo, el documento con las secciones de «Nuevo
//   documento» (`DocumentoDelDte`).
// - «Corregir» (§9.32; Felipe, 08-11: *"no me gustan todos estos chip"*)
//   abre el mismo documento por secciones, con casillas (`CorregirDte`, la
//   pieza de «Nuevo DTE»), desde lo que se está revisando (lo de BelIA o lo
//   ya corregido). Abajo, «Cancelar», «Listo» (vuelve al documento con lo
//   corregido) y «Aprobar». Corregir uno ya aprobado lo deja sin aprobar
//   hasta que se apruebe de nuevo.
// - «Aprobar» lo deja listo, tal como se ve, y pasa al siguiente sin
//   aprobar. Lo que no está listo no se aprueba: dice qué le falta.
// - «Facturar las N aprobadas · $X» las emite una tras otra (desde el 08-11,
//   §9.33, sin volver a preguntar: cada una ya se aprobó); si una se corta o
//   no sale, se detiene ahí (lo emitido queda emitido). Las que no se
//   aprobaron no se emiten.

const clp = (n: number) => `$${Math.round(n).toLocaleString("es-CL")}`;
const NOMBRE = { 33: "Factura", 39: "Boleta" } as const;

type Resultado =
  | { como: "emitido"; doc: DocumentoTributario }
  | { como: "por_confirmar" }
  | { como: "error"; texto: string };

const claseBoton =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50";

export default function RevisionDeLaFacturacion({
  eventos,
  noLeidas,
  onCerrar,
  onEmitidos,
}: {
  /** Los marcados, en el orden de la lista. */
  readonly eventos: readonly EventoPorFacturar[];
  readonly noLeidas: readonly OcSinLeer[];
  readonly onCerrar: () => void;
  readonly onEmitidos: () => void;
}) {
  const revisados = useQueries({
    queries: eventos.map((e) => ({
      queryKey: ["facturacion", "revision", e.id],
      queryFn: () => revisarUnoParaLaMasiva(e.id),
      gcTime: 0,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: false,
    })),
  });
  const [indice, setIndice] = useState(0);
  const [corregidos, setCorregidos] = useState<
    Record<string, RevisadoParaLaMasiva>
  >({});
  const [aprobados, setAprobados] = useState<ReadonlySet<string>>(new Set());
  const [corrigiendo, setCorrigiendo] = useState(false);
  // Lo que se está corrigiendo, con su revisión del motor.
  const [enCurso, setEnCurso] = useState<EnCorreccion | null>(null);
  const [emitiendo, setEmitiendo] = useState(false);
  const [resultados, setResultados] = useState<Record<string, Resultado>>({});

  const dteDe = (j: number): RevisadoParaLaMasiva | undefined =>
    corregidos[eventos[j].id] ?? revisados[j]?.data;
  const evento = eventos[indice];
  const consulta = revisados[indice];
  const dte = dteDe(indice);
  const aprobado = aprobados.has(evento.id);
  const porEmitir = eventos
    .map((e, j) => ({ e, dte: dteDe(j) }))
    .filter(
      (x): x is { e: EventoPorFacturar; dte: RevisadoParaLaMasiva } =>
        aprobados.has(x.e.id) && !!x.dte && !resultados[x.e.id],
    );
  const total = porEmitir.reduce(
    (s, x) => s + (x.dte.vista.montos?.total ?? 0),
    0,
  );
  const termino = Object.keys(resultados).length > 0 && !emitiendo;
  const falta = dte ? loQueLeFalta(dte.vista) : null;

  const ir = (j: number) => {
    setCorrigiendo(false);
    setEnCurso(null);
    setIndice(j);
  };

  const aprobar = (corregido?: RevisadoParaLaMasiva) => {
    if (corregido) setCorregidos((c) => ({ ...c, [evento.id]: corregido }));
    const nuevos = new Set(aprobados);
    nuevos.add(evento.id);
    setAprobados(nuevos);
    setCorrigiendo(false);
    setEnCurso(null);
    // Sigue con el próximo que falta por aprobar.
    const siguiente = eventos.findIndex(
      (e, j) => j > indice && !nuevos.has(e.id),
    );
    if (siguiente >= 0) setIndice(siguiente);
  };

  const corregir = () => {
    // Corregido, deja de estar aprobado hasta que se apruebe de nuevo.
    setAprobados((a) => {
      const n = new Set(a);
      n.delete(evento.id);
      return n;
    });
    setEnCurso(null);
    setCorrigiendo(true);
  };

  /** «Listo»: vuelve al documento con lo corregido, sin aprobarlo. */
  const listo = () => {
    if (enCurso) setCorregidos((c) => ({ ...c, [evento.id]: enCurso.dte }));
    setCorrigiendo(false);
    setEnCurso(null);
  };

  const emitir = async () => {
    setEmitiendo(true);
    let emitidos = 0;
    for (const { e, dte: d } of porEmitir) {
      try {
        const doc = await emitirDte(e.id, d.pedida);
        if (doc.estado === "por_confirmar") {
          setResultados((x) => ({ ...x, [e.id]: { como: "por_confirmar" } }));
          toast.warn(
            `Se cortó la conexión con facturacion.cl en el #${e.numero}: queda por confirmar. Se detuvo ahí.`,
            { sticky: true },
          );
          break;
        }
        emitidos++;
        setResultados((x) => ({ ...x, [e.id]: { como: "emitido", doc } }));
      } catch (error) {
        setResultados((x) => ({
          ...x,
          [e.id]: {
            como: "error",
            texto: humanizeApiError(error, "No se pudo emitir."),
          },
        }));
        toast.error(`El #${e.numero} no salió: se detuvo ahí.`);
        break;
      }
    }
    setEmitiendo(false);
    if (emitidos)
      toast.success(
        `${emitidos} ${emitidos === 1 ? "documento emitido" : "documentos emitidos"}.`,
      );
    onEmitidos();
  };

  const titulo = (
    <span className="flex w-full items-center justify-center gap-3">
      {/* Compensa el ✕ del otro extremo, para que quede al centro. */}
      <span className="w-7 shrink-0" aria-hidden="true" />
      <button
        type="button"
        onClick={() => ir(indice - 1)}
        disabled={indice === 0 || emitiendo || termino}
        aria-label="Anterior"
        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-25"
      >
        <ChevronLeft className="h-6 w-6" />
      </button>
      <span className="min-w-0 truncate text-lg font-bold">
        {termino
          ? "Lo emitido"
          : `#${evento.numero} · ${evento.cliente ?? "—"}`}
      </span>
      <button
        type="button"
        onClick={() => ir(indice + 1)}
        disabled={indice + 1 >= eventos.length || emitiendo || termino}
        aria-label="Siguiente"
        className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-25"
      >
        <ChevronRight className="h-6 w-6" />
      </button>
    </span>
  );

  const subtitulo = (
    <span className="flex justify-center">
      <span className="w-7 shrink-0" aria-hidden="true" />
      <span>
        {indice + 1} de {eventos.length} · {aprobados.size}{" "}
        {aprobados.size === 1 ? "aprobada" : "aprobadas"}
        {aprobado && !termino && (
          <span className="text-emerald-700"> · esta, aprobada</span>
        )}
      </span>
    </span>
  );

  const pie = termino ? (
    <button
      type="button"
      onClick={onCerrar}
      className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700"
    >
      Cerrar
    </button>
  ) : corrigiendo ? (
    <>
      <button
        type="button"
        onClick={() => {
          setCorrigiendo(false);
          setEnCurso(null);
        }}
        className={claseBoton}
      >
        Cancelar
      </button>
      <button
        type="button"
        onClick={listo}
        disabled={!enCurso}
        className={claseBoton}
      >
        Listo
      </button>
      <button
        type="button"
        onClick={() => enCurso && aprobar(enCurso.dte)}
        disabled={!enCurso?.listo}
        title={
          enCurso && !enCurso.listo
            ? (loQueLeFalta(enCurso.dte.vista) ?? "Revisando…")
            : undefined
        }
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        <Check size={14} /> Aprobar
      </button>
    </>
  ) : (
    <>
      {!corrigiendo && (
        <>
          <button
            type="button"
            onClick={corregir}
            disabled={emitiendo || !dte}
            className={claseBoton}
          >
            <Pencil size={14} /> Corregir
          </button>
          <button
            type="button"
            onClick={() => aprobar()}
            disabled={emitiendo || aprobado || !dte?.vista.ok}
            title={falta ?? undefined}
            className={`${claseBoton} ${aprobado ? "border-emerald-300 text-emerald-700" : ""}`}
          >
            <Check size={14} /> {aprobado ? "Aprobada" : "Aprobar"}
          </button>
        </>
      )}
      <button
        type="button"
        onClick={() => void emitir()}
        disabled={emitiendo || porEmitir.length === 0}
        className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
      >
        {emitiendo
          ? "Emitiendo…"
          : porEmitir.length === 0
            ? "Facturar las 0 aprobadas"
            : `${porEmitir.length === 1 ? "Facturar la aprobada" : `Facturar las ${porEmitir.length} aprobadas`} · ${clp(total)}`}
      </button>
    </>
  );

  return (
    <Modal
      titulo={titulo}
      subtitulo={subtitulo}
      ancho="max-w-5xl"
      // Con aprobadas o emitiendo, una tecla no se lleva el trabajo.
      bloquearEscape={emitiendo || aprobados.size > 0}
      onCerrar={() => {
        if (!emitiendo) onCerrar();
      }}
      pie={pie}
    >
      {termino ? (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {eventos
              .filter((e) => aprobados.has(e.id))
              .map((e) => {
                const r = resultados[e.id];
                return (
                  <tr key={e.id}>
                    <td className="py-1.5 pr-2 font-semibold text-gray-900">
                      #{e.numero}
                    </td>
                    <td className="py-1.5 pr-2 text-gray-700">
                      {e.cliente ?? "—"}
                    </td>
                    <td className="py-1.5 text-right text-xs">
                      {r?.como === "emitido" ? (
                        <span className="font-semibold text-green-700">
                          {NOMBRE[r.doc.tipo as 33 | 39] ?? "Documento"} N°{" "}
                          {r.doc.folio} emitida
                          {marcaDelAmbiente(r.doc.ambiente)}
                        </span>
                      ) : r?.como === "por_confirmar" ? (
                        <span className="font-semibold text-amber-700">
                          Por confirmar: no la emitas de nuevo
                        </span>
                      ) : r?.como === "error" ? (
                        <span className="text-red-600">{r.texto}</span>
                      ) : (
                        <span className="text-gray-500">
                          No se emitió: se detuvo antes
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      ) : (
        <div className="space-y-3">
          <LoDelEvento
            evento={evento}
            noLeidas={noLeidas}
            vista={
              (corrigiendo ? enCurso?.dte.vista : null) ?? dte?.vista ?? null
            }
          />
          {corrigiendo && dte ? (
            <CorregirDte
              key={evento.id}
              quotationId={evento.id}
              inicial={dte}
              onCambio={setEnCurso}
            />
          ) : dte ? (
            <DocumentoDelDte pedida={dte.pedida} vista={dte.vista} />
          ) : consulta?.isError ? (
            <p className="text-sm text-red-600">
              {humanizeApiError(
                consulta.error,
                "BelIA no pudo armar este documento.",
              )}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-sm text-violet-700">
              <Sparkles size={14} /> BelIA está armando el documento…
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
