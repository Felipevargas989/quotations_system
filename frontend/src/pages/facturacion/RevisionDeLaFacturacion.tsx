import { useMemo, useRef, useState } from "react";
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
  guardarAprobada,
  prepararDte,
  quitarAprobada,
  revisarDte,
  type DocumentoTributario,
  type DtePedido,
  type EventoPorFacturar,
  type FacturaAprobada,
  type OcSinLeer,
  type PreparacionDelDte,
} from "../../services/facturas.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";
import CorregirDte, { type EnCorreccion } from "./CorregirDte";
import DocumentoDelDte from "./DocumentoDelDte";
import type { FilaDeLaOc } from "./FacturasDeLaOc";
import LoDelEvento from "./LoDelEvento";
import {
  nombreDeLaLinea,
  porClave,
  revisablesDe,
  type Revisable,
} from "./revisables";
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
// - Un evento con varias OC con saldo va en una factura por OC (Felipe,
//   08-11: *"una factura por cada OC"*, como Santo Tomás con sus tres): cada
//   una se revisa, aprueba y emite aparte, a nombre del comprador de su OC.
//   BelIA lee el evento una sola vez, y la barra cuenta lo de las anteriores
//   del mismo evento.
// - Lo aprobado queda guardado (§9.48; Felipe, 11-11: *"ya revisé y dejé la
//   facturación hecha (…) la próxima persona, cuando decida facturar, la
//   factura está lista, llegar y pinchar no más"*): «Aprobar» guarda el
//   documento tal como se ve y quien entre después, otro día u otra
//   persona, lo encuentra aprobado, con quién lo aprobó. Al abrirse, el
//   motor lo revisa de nuevo: si algo cambió y ya no está listo, vuelve a
//   quedar sin aprobar y dice qué le falta. «Corregir» lo saca de lo
//   guardado, y lo emitido también.

/** Una aprobada guardada se abre con su documento, revisado de nuevo por
 *  el motor; lo de BelIA va igual, para que «Corregir» tenga de dónde. */
const revisarLaGuardada = async (
  it: Revisable,
  guardada: FacturaAprobada,
  preparar: (id: string) => Promise<PreparacionDelDte>,
): Promise<RevisadoParaLaMasiva> => {
  const [deBelia, vista] = await Promise.all([
    revisarUnoParaLaMasiva(it.evento.id, it.ocId, preparar, it.linea).catch(
      () => null,
    ),
    revisarDte(it.evento.id, guardada.pedida),
  ]);
  return {
    ...(deBelia ?? {}),
    tipo: guardada.pedida.tipo,
    pedida: guardada.pedida,
    vista,
  };
};

/** §9.59: la factura de una línea de la OC lleva su línea, también si
 *  «Corregir» armó el documento de nuevo. */
const conSuLinea = (pedida: DtePedido, it: Revisable): DtePedido =>
  it.linea != null && it.ocId != null
    ? { ...pedida, orden_de_compra_id: it.ocId, linea_de_la_oc: it.linea }
    : pedida;

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
  aprobadas = [],
  onCerrar,
  onEmitidos,
}: {
  /** Los marcados, en el orden de la lista. */
  readonly eventos: readonly EventoPorFacturar[];
  readonly noLeidas: readonly OcSinLeer[];
  /** §9.48: lo aprobado y guardado, como estaba al abrir la ventana. */
  readonly aprobadas?: readonly FacturaAprobada[];
  readonly onCerrar: () => void;
  readonly onEmitidos: () => void;
}) {
  const items = useMemo(() => revisablesDe(eventos), [eventos]);
  // Fijas mientras la ventana está abierta, como los eventos.
  const [guardadas] = useState(() => porClave(aprobadas));
  // Las facturas de un mismo evento comparten la lectura de BelIA.
  const preparaciones = useRef(new Map<string, Promise<PreparacionDelDte>>());
  const prepararUnaVez = (id: string) => {
    const guardada = preparaciones.current.get(id);
    if (guardada) return guardada;
    const nueva = prepararDte(id);
    preparaciones.current.set(id, nueva);
    return nueva;
  };
  const revisados = useQueries({
    queries: items.map((it) => ({
      queryKey: ["facturacion", "revision", it.clave],
      queryFn: () => {
        const guardada = guardadas.get(it.clave);
        return guardada
          ? revisarLaGuardada(it, guardada, prepararUnaVez)
          : revisarUnoParaLaMasiva(
              it.evento.id,
              it.ocId,
              prepararUnaVez,
              it.linea,
            );
      },
      gcTime: 0,
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      retry: false,
    })),
  });
  // §9.60: las guardadas armadas (listas para revisar) no cuentan como
  // aprobadas.
  const aprobadaGuardada = (clave: string) => {
    const g = guardadas.get(clave);
    return !!g && g.estado !== "armada";
  };
  // Parte en la primera que falta por aprobar (o en la primera, si todas
  // vienen aprobadas: llegar y facturar).
  const [indice, setIndice] = useState(() =>
    Math.max(
      0,
      items.findIndex((x) => !aprobadaGuardada(x.clave)),
    ),
  );
  const [corregidos, setCorregidos] = useState<
    Record<string, RevisadoParaLaMasiva>
  >({});
  const [marcados, setAprobados] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        items.filter((x) => aprobadaGuardada(x.clave)).map((x) => x.clave),
      ),
  );
  // §9.60: las armadas, guardadas para revisar sin aprobar.
  const [armadas, setArmadas] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        items
          .filter((x) => guardadas.get(x.clave)?.estado === "armada")
          .map((x) => x.clave),
      ),
  );
  // Lo que se está guardando o quitando: «Facturar» lo espera, para que
  // nada quede guardado después de emitido.
  const enCamino = useRef(new Set<Promise<unknown>>());
  const seguir = (p: Promise<unknown>) => {
    enCamino.current.add(p);
    void p.finally(() => enCamino.current.delete(p));
  };
  const [corrigiendo, setCorrigiendo] = useState(false);
  // Lo que se está corrigiendo, con su revisión del motor.
  const [enCurso, setEnCurso] = useState<EnCorreccion | null>(null);
  const [emitiendo, setEmitiendo] = useState(false);
  const [resultados, setResultados] = useState<Record<string, Resultado>>({});

  const dteDe = (j: number): RevisadoParaLaMasiva | undefined =>
    corregidos[items[j].clave] ?? revisados[j]?.data;
  // Aprobado de verdad: una guardada que al abrirse ya no está lista (algo
  // cambió desde que se aprobó) no cuenta hasta corregirla y aprobarla.
  const aprobados: ReadonlySet<string> = new Set(
    items
      .filter((x, j) => marcados.has(x.clave) && dteDe(j)?.vista.ok !== false)
      .map((x) => x.clave),
  );
  const item = items[indice];
  const evento = item.evento;
  const consulta = revisados[indice];
  const dte = dteDe(indice);
  const aprobado = aprobados.has(item.clave);
  const armada = !aprobado && armadas.has(item.clave);
  const guardada = guardadas.get(item.clave);
  // Lo de las otras facturas APROBADAS de este mismo evento (una por OC):
  // la barra del evento las cuenta como facturadas; las que no se
  // aprueban, no (Felipe, 08-11: *"solo debería sumar las que están
  // aprobadas + ya facturadas"*).
  const enEstaRevision = items.reduce(
    (s, x, j) =>
      j !== indice && x.evento.id === evento.id && aprobados.has(x.clave)
        ? s + (dteDe(j)?.vista.montos?.total ?? 0)
        : s,
    0,
  );
  // §9.60: las facturas de la OC de esta, una por fila (la que se revisa,
  // las aprobadas, las armadas y las por revisar).
  const ocDe = (j: number) =>
    items[j].ocId ?? dteDe(j)?.pedida.orden_de_compra_id ?? null;
  const ocActual = ocDe(indice);
  const vistaActual =
    (corrigiendo ? enCurso?.dte.vista : null) ?? dte?.vista ?? null;
  // Quién dejó la que se revisa en su estado, si sigue como se guardó.
  const quienLaGuardo =
    guardada &&
    !corregidos[item.clave] &&
    (aprobado || armada) &&
    (guardada.estado === "armada") === armada
      ? `${guardada.aprobada_por_nombre} · ${formatMomento(guardada.aprobada_en, "diaMes")}`
      : null;
  // Sin OC, las del evento sin OC (§9.60, «Opción 1, lista»).
  const filasDeLaOc: FilaDeLaOc[] = items.flatMap((x, j): FilaDeLaOc[] => {
    if (x.evento.id !== evento.id || ocDe(j) !== ocActual) return [];
    const d = j === indice ? undefined : dteDe(j);
    const pedida =
      j === indice
        ? ((corrigiendo ? enCurso?.dte.pedida : null) ?? dte?.pedida)
        : d?.pedida;
    return [
      {
        clave: x.clave,
        etiqueta:
          x.linea != null
            ? nombreDeLaLinea(x.linea).replace("línea", "Línea")
            : (j === indice ? dte : dteDe(j))?.tipo === 39
              ? "Boleta"
              : "Factura",
        nota: pedida?.referencias.find((r) => r.tipo === "802")?.folio || null,
        monto: (j === indice ? vistaActual : d?.vista)?.montos?.total ?? null,
        estado: aprobados.has(x.clave)
          ? "aprobada"
          : armadas.has(x.clave)
            ? "armada"
            : "por_revisar",
        actual: j === indice,
        quien: j === indice ? quienLaGuardo : null,
      },
    ];
  });
  const porEmitir = items
    .map((it, j) => ({ it, dte: dteDe(j) }))
    .filter(
      (x): x is { it: Revisable; dte: RevisadoParaLaMasiva } =>
        aprobados.has(x.it.clave) && !!x.dte && !resultados[x.it.clave],
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

  /** §9.48: «Aprobar» la guarda aprobada; §9.60: «Dejar armada», lista
   *  para revisar, sin aprobarla. */
  const guardar = (
    estado: "armada" | "aprobada",
    corregido?: RevisadoParaLaMasiva,
  ) => {
    const documento = corregido ?? dte;
    if (!documento) return;
    if (corregido) setCorregidos((c) => ({ ...c, [item.clave]: corregido }));
    const { clave } = item;
    const sacar = (s: ReadonlySet<string>) => {
      const n = new Set(s);
      n.delete(clave);
      return n;
    };
    const nuevos = new Set(aprobados);
    const nuevasArmadas = new Set(armadas);
    if (estado === "aprobada") {
      nuevos.add(clave);
      nuevasArmadas.delete(clave);
    } else {
      nuevos.delete(clave);
      nuevasArmadas.add(clave);
    }
    setAprobados(nuevos);
    setArmadas(nuevasArmadas);
    seguir(
      guardarAprobada(
        evento.id,
        item.ocId,
        conSuLinea(documento.pedida, item),
        estado,
      ).catch((err) => {
        setAprobados(sacar);
        setArmadas(sacar);
        toast.error(
          humanizeApiError(
            err,
            estado === "aprobada"
              ? `No se pudo guardar la aprobación del #${evento.numero}.`
              : `No se pudo dejar armada la del #${evento.numero}.`,
          ),
        );
      }),
    );
    setCorrigiendo(false);
    setEnCurso(null);
    // Sigue con el próximo que falta por aprobar (y, al armar, por armar).
    const siguiente = items.findIndex(
      (x, j) =>
        j > indice &&
        !nuevos.has(x.clave) &&
        (estado === "aprobada" || !nuevasArmadas.has(x.clave)),
    );
    if (siguiente >= 0) setIndice(siguiente);
  };
  // §9.60 (Felipe, 25-11: *"el dejar armada es un proceso interno (…)
  // nosotros corregimos, aprobamos, facturamos"*): la ventana solo aprueba;
  // la armada la deja el sistema.
  const aprobar = (corregido?: RevisadoParaLaMasiva) =>
    guardar("aprobada", corregido);

  const corregir = () => {
    // Corregido, deja de estar aprobado (o armado) hasta que se guarde de
    // nuevo.
    if (marcados.has(item.clave) || armadas.has(item.clave))
      seguir(
        quitarAprobada(evento.id, item.ocId, item.linea).catch((err) =>
          toast.error(
            humanizeApiError(err, "No se pudo quitar la aprobación guardada."),
          ),
        ),
      );
    setAprobados((a) => {
      const n = new Set(a);
      n.delete(item.clave);
      return n;
    });
    setArmadas((a) => {
      const n = new Set(a);
      n.delete(item.clave);
      return n;
    });
    setEnCurso(null);
    setCorrigiendo(true);
  };

  /** «Listo»: vuelve al documento con lo corregido, sin aprobarlo. */
  const listo = () => {
    if (enCurso) setCorregidos((c) => ({ ...c, [item.clave]: enCurso.dte }));
    setCorrigiendo(false);
    setEnCurso(null);
  };

  const emitir = async () => {
    setEmitiendo(true);
    await Promise.allSettled([...enCamino.current]);
    let emitidos = 0;
    for (const { it, dte: d } of porEmitir) {
      const e = it.evento;
      try {
        const doc = await emitirDte(e.id, conSuLinea(d.pedida, it));
        if (doc.estado === "por_confirmar") {
          setResultados((x) => ({
            ...x,
            [it.clave]: { como: "por_confirmar" },
          }));
          toast.warn(
            `Se cortó la conexión con facturacion.cl en el #${e.numero}: queda por confirmar. Se detuvo ahí.`,
            { sticky: true },
          );
          break;
        }
        emitidos++;
        setResultados((x) => ({ ...x, [it.clave]: { como: "emitido", doc } }));
      } catch (error) {
        setResultados((x) => ({
          ...x,
          [it.clave]: {
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
        disabled={indice + 1 >= items.length || emitiendo || termino}
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
        {/* §9.60: el estado y quién, en la fila azul de la lista. */}
        {indice + 1} de {items.length}
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
      // Emitiendo, una tecla no cierra la ventana. Lo aprobado ya quedó
      // guardado (§9.48): cerrar no se lo lleva.
      bloquearEscape={emitiendo}
      onCerrar={() => {
        if (!emitiendo) onCerrar();
      }}
      pie={pie}
    >
      {termino ? (
        <table className="w-full text-sm">
          <tbody className="divide-y divide-gray-100">
            {items
              .filter((it) => aprobados.has(it.clave))
              .map((it) => {
                const r = resultados[it.clave];
                return (
                  <tr key={it.clave}>
                    <td className="py-1.5 pr-2 font-semibold text-gray-900">
                      #{it.evento.numero}
                      {it.ocNumero && (
                        <span className="font-normal text-gray-500">
                          {" "}
                          · OC {it.ocNumero}
                          {it.linea != null &&
                            ` · ${nombreDeLaLinea(it.linea)}`}
                        </span>
                      )}
                    </td>
                    <td className="py-1.5 pr-2 text-gray-700">
                      {it.evento.cliente ?? "—"}
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
            tipo={(corrigiendo ? enCurso?.dte.tipo : null) ?? dte?.tipo}
            // La OC del documento tiene su propia barra, también cuando el
            // evento va con una sola (Felipe, 08-11).
            ocActual={ocActual}
            enEstaRevision={enEstaRevision}
            filasDeLaOc={filasDeLaOc}
          />
          {corrigiendo && dte ? (
            <CorregirDte
              key={item.clave}
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
