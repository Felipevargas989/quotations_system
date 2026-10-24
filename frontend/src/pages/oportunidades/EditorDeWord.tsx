import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bold,
  Download,
  Italic,
  Loader2,
  PenLine,
  ShieldCheck,
  Underline,
} from "lucide-react";
import {
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  memo,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import ConfirmInline from "../../components/ConfirmInline";
import Modal from "../../components/Modal";
import { toast } from "../../components/toast/Toast";
import {
  abrirElWord,
  type BloqueDelWord,
  guardarElWord,
  type ParrafoDelWord,
  type ParrafoEditado,
  type TablaDelWord,
} from "../../services/editorDelWord.service";
import {
  type AdjuntoDeOportunidad,
  getValidacion,
  pedirValidacion,
  type ValidacionDeDocumentos,
} from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { descargarDelBalde } from "./descargas";
import {
  contarPorEstadoDeValidacion,
  LISTO_PARA_POSTULAR,
} from "./oportunidades.utils";
import {
  cambio,
  colorDe,
  cuantosPendientes,
  familiaDe,
  htmlDelParrafo,
  paraGuardar,
  parrafosPorId,
  tramosDelElemento,
} from "./reglasDelEditor";

// EL DOCUMENTO DE LA POSTULACIÓN: VERLO Y EDITARLO EN UNA SOLA PANTALLA
// (decisión 78 del doc 17, 24-10). Felipe: "hoy para completar eso debo
// bajarlo, editarlo y subirlo... un documento editable que pueda escribir
// y/o modificar en línea (lo básico: escribir, borrar, negrita, cursiva)",
// y después: "el ver y editar debería ser el mismo... yo debería ver el
// documento, ahí mismo poder editar, guardar, después tener abajo o al lado
// un botón de volver a validar en caso de que yo haya hecho un cambio,
// firmo y se pasa a PDF".
//
// Se ve el documento como es (con su encabezado, su logo, su letra y sus
// colores) y se escribe encima, párrafo por párrafo. Por dentro sigue
// siendo el Word del comprador (o el que la IA reescribió de su PDF): el
// motor guarda solo lo que cambió, sin tocar su diseño, y al firmar queda
// el PDF que se sube a Mercado Público. Los [COMPLETAR] y [ILEGIBLE] van en
// amarillo y «Siguiente» lleva a cada uno con su texto marcado. Enter hace
// un salto de línea dentro del párrafo. El encabezado, el pie y lo que
// tiene una imagen, un campo automático o un vínculo se ve, pero no se
// edita aquí.

// El navegador hace la negrita, la cursiva, el salto de línea y el pegado
// sin formato (no hay otra forma de hacerlo en un texto editable).
const ejecutar = (orden: string, valor?: string) =>
  (
    document as unknown as {
      execCommand: (o: string, ui: boolean, v?: string) => boolean;
    }
  ).execCommand(orden, false, valor);

const alTeclear = (e: KeyboardEvent<HTMLElement>) => {
  if (e.key !== "Enter") return;
  e.preventDefault();
  ejecutar("insertLineBreak");
};

// Se pega solo el texto: el formato de otro documento no entra al Word.
const alPegar = (e: ClipboardEvent<HTMLElement>) => {
  e.preventDefault();
  e.clipboardData
    .getData("text/plain")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .forEach((linea, i) => {
      if (i > 0) ejecutar("insertLineBreak");
      if (linea) ejecutar("insertText", linea);
    });
};

const ALINEACION: Record<
  NonNullable<ParrafoDelWord["alineacion"]>,
  CSSProperties["textAlign"]
> = { centro: "center", derecha: "right", justificado: "justify" };

const estiloDelParrafo = (p: ParrafoDelWord): CSSProperties => ({
  textAlign: p.alineacion ? ALINEACION[p.alineacion] : undefined,
  marginLeft: p.sangria ? `${p.sangria}pt` : undefined,
  fontWeight: p.formato.b ? 700 : 400,
  fontStyle: p.formato.i ? "italic" : "normal",
  textDecoration: p.formato.u ? "underline" : "none",
  fontSize: p.formato.pt ? `${p.formato.pt}pt` : undefined,
  fontFamily: familiaDe(p.formato.f),
  color: colorDe(p.formato.c),
});

// Memo: después de abrir, React no vuelve a dibujar los párrafos; lo
// escrito vive en la página hasta guardar.
const Parrafo = memo(function Parrafo({ p }: { readonly p: ParrafoDelWord }) {
  const estilo = estiloDelParrafo(p);
  const cuerpo = p.editable ? (
    <p
      data-p={p.id}
      contentEditable
      suppressContentEditableWarning
      onKeyDown={alTeclear}
      onPaste={alPegar}
      onDrop={(e) => e.preventDefault()}
      className="min-h-[1.4em] whitespace-pre-wrap rounded-sm outline-none hover:bg-blue-50/50 focus:bg-blue-50"
      style={estilo}
      dangerouslySetInnerHTML={{ __html: htmlDelParrafo(p) }}
    />
  ) : (
    <div
      className="min-h-[1.4em] cursor-default whitespace-pre-wrap rounded-sm"
      style={estilo}
      title={`No se edita aquí: ${p.motivo ?? "tiene un elemento especial"}.`}
    >
      {p.imagenes?.map((img, i) => (
        <img
          key={i}
          src={img.src}
          alt=""
          className="inline-block max-w-full align-middle"
          style={{ width: img.ancho ? `${img.ancho}pt` : undefined }}
        />
      ))}
      {p.tramos.length > 0 && (
        <span dangerouslySetInnerHTML={{ __html: htmlDelParrafo(p) }} />
      )}
    </div>
  );
  return p.vineta ? (
    <div className="flex gap-2">
      <span aria-hidden="true">•</span>
      <div className="min-w-0 flex-1">{cuerpo}</div>
    </div>
  ) : (
    cuerpo
  );
});

const Tabla = memo(function Tabla({ t }: { readonly t: TablaDelWord }) {
  return (
    <table className="my-2 w-full border-collapse">
      <tbody>
        {t.filas.map((fila, i) => (
          <tr key={i}>
            {fila.map((c, j) => (
              <td
                key={j}
                colSpan={c.columnas}
                rowSpan={c.filas}
                className="border border-gray-300 px-1.5 py-1 align-top"
                style={{
                  width: c.ancho ? `${c.ancho}%` : undefined,
                  background: c.fondo ? `#${c.fondo}` : undefined,
                }}
              >
                <Bloques bloques={c.bloques} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
});

const Bloques = memo(function Bloques({
  bloques,
}: {
  readonly bloques: readonly BloqueDelWord[];
}) {
  return (
    <>
      {bloques.map((b, k) =>
        b.tipo === "parrafo" ? (
          <Parrafo key={`p${b.id}`} p={b} />
        ) : (
          <Tabla key={`t${k}`} t={b} />
        ),
      )}
    </>
  );
});

/** Lo último que dijo la validación, en corto, arriba del documento. */
function LaValidacion({
  validacion,
  pidiendo,
  editadoEn,
}: {
  readonly validacion: ValidacionDeDocumentos | null | undefined;
  readonly pidiendo: boolean;
  readonly editadoEn: string | null | undefined;
}) {
  if (pidiendo || validacion?.estado === "procesando") {
    return (
      <p className="flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
        <Loader2 size={14} className="animate-spin" aria-hidden />
        Validando tus documentos contra las bases. Tarda un par de minutos.
      </p>
    );
  }
  if (validacion?.estado === "error") {
    return (
      <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
        La última validación no terminó. Vuelve a validar.
      </p>
    );
  }
  const r = validacion?.estado === "listo" ? validacion.resultado : null;
  if (!r || !validacion) return null;
  const listo = LISTO_PARA_POSTULAR[r.listo];
  const conteo = contarPorEstadoDeValidacion(r.requisitos);
  const vieja = Boolean(
    editadoEn &&
      new Date(validacion.creado_en).getTime() < new Date(editadoEn).getTime(),
  );
  return (
    <div className={`space-y-1 rounded-lg border px-3 py-2 ${listo.clases}`}>
      <p className="text-sm font-semibold">
        Validación: {listo.titulo}
        {vieja && (
          <span className="ml-2 font-normal">
            · es de antes de tus últimos cambios: vuelve a validar.
          </span>
        )}
      </p>
      <p className="text-sm">{r.resumen}</p>
      <p className="text-xs">
        {conteo.cumple} cumplen · {conteo.falta} faltan · {conteo.revisar} por
        revisar · {conteo.vencido} vencidos. El detalle está en «Validar
        documentos», en la ficha.
      </p>
      {r.otros_problemas.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-5 text-xs">
          {r.otros_problemas.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function EditorDeWord({
  oportunidadId,
  adjunto,
  onCerrar,
  onFirmar,
  firmando = false,
}: {
  readonly oportunidadId: number;
  readonly adjunto: AdjuntoDeOportunidad;
  readonly onCerrar: () => void;
  /** Firma este Word (lo deja en PDF). Sin él, no se firma desde aquí. */
  readonly onFirmar?: (adjuntoId: number) => void;
  /** Ya hay una firma en curso. */
  readonly firmando?: boolean;
}) {
  const qc = useQueryClient();
  // Al guardar, el archivo pasa a otra ruta: la fila nueva manda.
  const [actual, setActual] = useState(adjunto);
  const { data, isPending, error } = useQuery({
    queryKey: [
      "oportunidades",
      "editor",
      oportunidadId,
      actual.id,
      actual.ruta,
    ],
    queryFn: () => abrirElWord(oportunidadId, actual.id),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
    // Mientras se relee lo guardado, se sigue viendo el documento.
    placeholderData: (antes) => antes,
  });
  const claveDeValidacion = ["oportunidades", "validacion", oportunidadId];
  const { data: validacion } = useQuery({
    queryKey: claveDeValidacion,
    queryFn: () => getValidacion(oportunidadId),
    refetchInterval: (q) =>
      q.state.data?.estado === "procesando" ? 5000 : false,
  });
  const hoja = useRef<HTMLDivElement>(null);
  const [sucio, setSucio] = useState(false);
  const [confirmar, setConfirmar] = useState<"salir" | "firmar" | null>(null);
  const [pendientes, setPendientes] = useState<number | null>(null);
  const siguiente = useRef(0);

  const porId = useMemo(
    () => (data ? parrafosPorId(data.bloques) : null),
    [data],
  );
  const quedan =
    pendientes ??
    [...(porId?.values() ?? [])].reduce(
      (n, p) => n + cuantosPendientes(p.tramos.map((t) => t.t).join("")),
      0,
    );

  /** Los párrafos que cambiaron, como quedaron. */
  const cambios = (): ParrafoEditado[] => {
    if (!porId || !hoja.current) return [];
    return Array.from(
      hoja.current.querySelectorAll<HTMLElement>("[data-p]"),
    ).flatMap((el) => {
      const p = porId.get(Number(el.dataset.p));
      const ahora = tramosDelElemento(el);
      return p && cambio(p, ahora)
        ? [{ id: p.id, tramos: paraGuardar(ahora) }]
        : [];
    });
  };

  const guardar = useMutation({
    mutationFn: (parrafos: ParrafoEditado[]) =>
      guardarElWord(oportunidadId, actual.id, data?.version ?? "", parrafos),
    onSuccess: (nuevo) => {
      setActual(nuevo);
      setSucio(false);
      setPendientes(null);
      void qc.invalidateQueries({
        queryKey: ["oportunidades", "adjuntos", oportunidadId],
      });
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo guardar.")),
  });

  /** Guarda si hay algo que guardar. Devuelve el archivo como quedó, o
   *  null si no se pudo. */
  const guardarSiHaceFalta = async (): Promise<AdjuntoDeOportunidad | null> => {
    const lista = cambios();
    if (lista.length === 0) {
      setSucio(false);
      return actual;
    }
    try {
      return await guardar.mutateAsync(lista);
    } catch {
      return null; // el aviso ya salió
    }
  };

  const validar = useMutation({
    mutationFn: () => pedirValidacion(oportunidadId),
    onSuccess: (fila) => qc.setQueryData(claveDeValidacion, fila),
    onError: (e) =>
      toast.error(humanizeApiError(e, "No se pudo pedir la validación.")),
  });

  const ocupado = guardar.isPending || validar.isPending;

  const alGuardar = async () => {
    const lista = cambios();
    if (lista.length === 0) {
      setSucio(false);
      return;
    }
    try {
      await guardar.mutateAsync(lista);
      toast.success("Guardado en el Word.");
    } catch {
      // el aviso ya salió
    }
  };

  const alValidar = async () => {
    if (await guardarSiHaceFalta()) validar.mutate();
  };

  const alDescargar = async () => {
    const a = await guardarSiHaceFalta();
    if (!a) return;
    try {
      await descargarDelBalde(a.ruta, a.nombre);
    } catch {
      toast.error("No se pudo descargar el Word.");
    }
  };

  const alFirmar = async () => {
    setConfirmar(null);
    const a = await guardarSiHaceFalta();
    if (!a || !onFirmar) return;
    onFirmar(a.id);
    onCerrar();
  };

  const intentarCerrar = () => {
    if (ocupado) return;
    if (cambios().length > 0) setConfirmar("salir");
    else onCerrar();
  };

  // Al escribir: cuántos pendientes quedan, y el amarillo se apaga en lo
  // que ya se llenó. Al escribir encima de un marcador entero, el navegador
  // lo borra y le copia su fondo a lo nuevo: ese fondo también se quita
  // (al Word no va: solo cuenta el texto y su negrita, cursiva y subrayado).
  const alEscribir = () => {
    setSucio(true);
    const raiz = hoja.current;
    if (!raiz) return;
    setPendientes(cuantosPendientes(raiz.textContent ?? ""));
    raiz
      .querySelectorAll<HTMLElement>(
        "[data-p] mark, [data-p] [style*='background']",
      )
      .forEach((el) => {
        if (/\[(COMPLETAR|ILEGIBLE)/i.test(el.textContent ?? "")) {
          el.style.removeProperty("background");
          return;
        }
        el.style.removeProperty("background-color");
        if (el.tagName === "MARK") el.style.background = "transparent";
      });
  };

  // «Siguiente»: lleva al próximo pendiente y lo deja marcado, para
  // escribir encima.
  const irAlSiguiente = () => {
    const raiz = hoja.current;
    if (!raiz) return;
    const marcas = Array.from(
      raiz.querySelectorAll<HTMLElement>("[data-p] mark[data-completar]"),
    ).filter((m) => /\[(COMPLETAR|ILEGIBLE)/i.test(m.textContent ?? ""));
    if (marcas.length === 0) return;
    const m = marcas[siguiente.current % marcas.length];
    siguiente.current += 1;
    m.closest<HTMLElement>("[data-p]")?.focus();
    m.scrollIntoView({ block: "center" });
    const rango = document.createRange();
    rango.selectNodeContents(m);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(rango);
  };

  const botonSecundario =
    "inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold hover:bg-gray-100 disabled:opacity-50";

  return createPortal(
    <Modal
      titulo={<span className="block truncate text-base">{actual.nombre}</span>}
      subtitulo="Léelo y escribe encima. Se guarda en el mismo documento, sin cambiar su diseño."
      ancho="max-w-5xl"
      altoFijo
      bloquearEscape
      onCerrar={intentarCerrar}
      acciones={
        data && (
          <div className="mr-2 flex items-center gap-1">
            {(
              [
                { orden: "bold", Icono: Bold, titulo: "Negrita" },
                { orden: "italic", Icono: Italic, titulo: "Cursiva" },
                { orden: "underline", Icono: Underline, titulo: "Subrayado" },
              ] as const
            ).map(({ orden, Icono, titulo }) => (
              <button
                key={orden}
                type="button"
                title={titulo}
                aria-label={titulo}
                // Sin perder lo marcado en el texto.
                onMouseDown={(e) => {
                  e.preventDefault();
                  ejecutar(orden);
                  alEscribir();
                }}
                className="rounded p-1.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
              >
                <Icono size={16} />
              </button>
            ))}
            {quedan > 0 && (
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  irAlSiguiente();
                }}
                className="ml-2 rounded-full bg-yellow-100 px-3 py-1 text-xs font-semibold text-yellow-900 hover:bg-yellow-200"
              >
                {quedan === 1
                  ? "Queda 1 por completar · Ir"
                  : `Quedan ${quedan} por completar · Siguiente`}
              </button>
            )}
          </div>
        )
      }
      pie={
        confirmar === "salir" ? (
          <ConfirmInline
            question="Tienes cambios sin guardar. ¿Salir sin guardarlos?"
            yesLabel="Salir sin guardar"
            onYes={onCerrar}
            onNo={() => setConfirmar(null)}
          />
        ) : confirmar === "firmar" ? (
          <ConfirmInline
            question={`${quedan > 0 ? `Quedan ${quedan} por completar. ` : ""}¿Ya lo revisaste? Se le pone la foto de la firma, queda en PDF y el Word se borra.`}
            yesLabel="Sí, firmar"
            onYes={() => void alFirmar()}
            onNo={() => setConfirmar(null)}
          />
        ) : (
          <>
            <span className="mr-auto text-xs text-gray-500">
              {guardar.isPending
                ? "Guardando…"
                : sucio
                  ? "Cambios sin guardar"
                  : ""}
            </span>
            <button
              type="button"
              onClick={() => void alDescargar()}
              disabled={!data || ocupado}
              className={`${botonSecundario} text-blue-600`}
            >
              <Download size={14} aria-hidden /> Descargar
            </button>
            <button
              type="button"
              onClick={() => void alValidar()}
              disabled={!data || ocupado || validacion?.estado === "procesando"}
              className={`${botonSecundario} text-blue-600`}
            >
              <ShieldCheck size={14} aria-hidden /> Volver a validar
            </button>
            {onFirmar && (
              <button
                type="button"
                onClick={() => setConfirmar("firmar")}
                disabled={!data || ocupado || firmando}
                title={firmando ? "Ya hay una firma en curso" : undefined}
                className={`${botonSecundario} text-green-700`}
              >
                <PenLine size={14} aria-hidden /> Firmar
              </button>
            )}
            <button
              type="button"
              onClick={() => void alGuardar()}
              disabled={!data || ocupado || !sucio}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {guardar.isPending && (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              )}
              Guardar
            </button>
          </>
        )
      }
    >
      {isPending ? (
        <div className="flex h-40 items-center justify-center text-sm text-gray-500">
          Abriendo el documento…
        </div>
      ) : error || !data ? (
        <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-red-600">
          {humanizeApiError(error, "No se pudo abrir este documento.")}
        </div>
      ) : (
        <div className="space-y-3 bg-gray-100 py-4">
          <div className="mx-auto max-w-[800px]">
            <LaValidacion
              validacion={validacion}
              pidiendo={validar.isPending}
              editadoEn={actual.editado_en}
            />
          </div>
          <div
            key={data.version}
            ref={hoja}
            lang="es"
            spellCheck
            onInput={alEscribir}
            className="mx-auto max-w-[800px] space-y-1 bg-white px-12 py-10 text-[11pt] leading-snug text-gray-900 shadow-sm"
          >
            {data.encabezado && (
              <div
                className="mb-6 space-y-1 border-b border-dashed border-gray-200 pb-3"
                title="El encabezado se ve, pero no se edita aquí."
              >
                <Bloques bloques={data.encabezado} />
              </div>
            )}
            <Bloques bloques={data.bloques} />
            {data.pie && (
              <div
                className="mt-6 space-y-1 border-t border-dashed border-gray-200 pt-3 text-[9pt] text-gray-500"
                title="El pie de página se ve, pero no se edita aquí."
              >
                <Bloques bloques={data.pie} />
              </div>
            )}
          </div>
          <p className="mx-auto max-w-[800px] text-xs text-gray-500">
            Enter hace un salto de línea. Lo que está en el encabezado y en el
            pie, y lo que tiene una imagen, un campo automático o un vínculo, se
            ve pero no se edita aquí.
          </p>
        </div>
      )}
    </Modal>,
    document.body,
  );
}
