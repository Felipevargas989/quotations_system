import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bold, Italic, Loader2, Underline } from "lucide-react";
import {
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  memo,
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
import type { AdjuntoDeOportunidad } from "../../services/oportunidades.service";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  cambio,
  cuantosPendientes,
  htmlDelParrafo,
  paraGuardar,
  parrafosPorId,
  PENDIENTE,
  tramosDelElemento,
} from "./reglasDelEditor";

// EL WORD SE EDITA EN EVENTIA (decisión 78 del doc 17, 24-10). Felipe: "hoy
// para completar eso debo bajarlo, editarlo y subirlo... un documento
// editable que pueda escribir y/o modificar en línea (lo básico: escribir,
// borrar, negrita, cursiva)". Se escribe encima del texto del formulario,
// párrafo por párrafo; al guardar, el motor lo pone en el MISMO Word, sin
// tocar su diseño (tablas, logo, márgenes). Los [COMPLETAR] van en
// amarillo y «Siguiente» lleva a cada uno con su texto marcado: se escribe
// encima. Enter hace un salto de línea dentro del párrafo. Lo que tiene
// una imagen, un campo automático o un vínculo se ve, pero no se edita
// aquí.

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
    <p
      className="min-h-[1.4em] whitespace-pre-wrap rounded-sm bg-gray-50 text-gray-500 cursor-not-allowed"
      style={estilo}
      title={`No se edita aquí: ${p.motivo ?? "tiene un elemento especial"}. Usa «Descargar».`}
    >
      {p.tramos.map((t) => t.t).join("") || `[${p.motivo ?? "sin texto"}]`}
    </p>
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

const BOTONES = [
  { orden: "bold", Icono: Bold, titulo: "Negrita" },
  { orden: "italic", Icono: Italic, titulo: "Cursiva" },
  { orden: "underline", Icono: Underline, titulo: "Subrayado" },
] as const;

export default function EditorDeWord({
  oportunidadId,
  adjunto,
  onCerrar,
}: {
  readonly oportunidadId: number;
  readonly adjunto: AdjuntoDeOportunidad;
  readonly onCerrar: () => void;
}) {
  const qc = useQueryClient();
  const { data, isPending, error } = useQuery({
    queryKey: [
      "oportunidades",
      "editor",
      oportunidadId,
      adjunto.id,
      adjunto.ruta,
    ],
    queryFn: () => abrirElWord(oportunidadId, adjunto.id),
    staleTime: Infinity,
    gcTime: 0,
    retry: false,
  });
  const hoja = useRef<HTMLDivElement>(null);
  const [sucio, setSucio] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [pendientes, setPendientes] = useState<number | null>(null);
  const siguiente = useRef(0);

  const porId = data ? parrafosPorId(data.bloques) : null;
  const quedan =
    pendientes ??
    (data
      ? [...(porId?.values() ?? [])].reduce(
          (n, p) => n + cuantosPendientes(p.tramos.map((t) => t.t).join("")),
          0,
        )
      : 0);

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
      guardarElWord(oportunidadId, adjunto.id, data?.version ?? "", parrafos),
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ["oportunidades", "adjuntos", oportunidadId],
      });
      toast.success(
        "Guardado en el Word. Si cambiaste algo de fondo, vuelve a validar los documentos.",
      );
      onCerrar();
    },
    onError: (e) => toast.error(humanizeApiError(e, "No se pudo guardar.")),
  });

  const alGuardar = () => {
    const lista = cambios();
    if (lista.length === 0) {
      onCerrar();
      return;
    }
    guardar.mutate(lista);
  };

  const intentarCerrar = () => {
    if (guardar.isPending) return;
    if (cambios().length > 0) setSaliendo(true);
    else onCerrar();
  };

  // Al escribir: cuántos [COMPLETAR] quedan, y el amarillo se apaga en el
  // que ya se llenó.
  const alEscribir = () => {
    setSucio(true);
    const raiz = hoja.current;
    if (!raiz) return;
    setPendientes(cuantosPendientes(raiz.textContent ?? ""));
    raiz.querySelectorAll<HTMLElement>("mark[data-completar]").forEach((m) => {
      PENDIENTE.lastIndex = 0;
      m.style.background = PENDIENTE.test(m.textContent ?? "")
        ? ""
        : "transparent";
    });
  };

  // «Siguiente»: lleva al próximo [COMPLETAR] y lo deja marcado, para
  // escribir encima.
  const irAlSiguiente = () => {
    const raiz = hoja.current;
    if (!raiz) return;
    const marcas = Array.from(
      raiz.querySelectorAll<HTMLElement>("mark[data-completar]"),
    ).filter((m) => /\[COMPLETAR/i.test(m.textContent ?? ""));
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

  return createPortal(
    <Modal
      titulo={
        <span className="block truncate text-base">{adjunto.nombre}</span>
      }
      subtitulo="Escribe encima del texto. Se guarda en el mismo Word: su diseño no cambia."
      ancho="max-w-5xl"
      altoFijo
      bloquearEscape
      onCerrar={intentarCerrar}
      acciones={
        data && (
          <div className="mr-2 flex items-center gap-1">
            {BOTONES.map(({ orden, Icono, titulo }) => (
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
        saliendo ? (
          <ConfirmInline
            question="Tienes cambios sin guardar. ¿Salir sin guardarlos?"
            yesLabel="Salir sin guardar"
            onYes={onCerrar}
            onNo={() => setSaliendo(false)}
          />
        ) : (
          <>
            {sucio && (
              <span className="mr-auto text-xs text-gray-500">
                Cambios sin guardar
              </span>
            )}
            <button
              type="button"
              onClick={intentarCerrar}
              disabled={guardar.isPending}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100 disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={alGuardar}
              disabled={!data || guardar.isPending}
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
            >
              {guardar.isPending && (
                <Loader2 size={14} className="animate-spin" aria-hidden />
              )}
              {guardar.isPending ? "Guardando…" : "Guardar en el Word"}
            </button>
          </>
        )
      }
    >
      {isPending ? (
        <div className="flex h-40 items-center justify-center text-sm text-gray-500">
          Abriendo el Word…
        </div>
      ) : error || !data ? (
        <div className="flex h-40 items-center justify-center px-4 text-center text-sm text-red-600">
          {humanizeApiError(error, "No se pudo abrir este Word para editarlo.")}
        </div>
      ) : (
        <div className="bg-gray-100 py-4">
          <div
            ref={hoja}
            lang="es"
            spellCheck
            onInput={alEscribir}
            className="mx-auto max-w-[800px] space-y-1 bg-white px-12 py-10 text-[12pt] leading-snug text-gray-900 shadow-sm"
          >
            <Bloques bloques={data.bloques} />
          </div>
          <p className="mx-auto mt-2 max-w-[800px] text-xs text-gray-500">
            Enter hace un salto de línea. El encabezado, el pie y lo que está en
            gris (imágenes, campos automáticos, vínculos) no se editan aquí.
          </p>
        </div>
      )}
    </Modal>,
    document.body,
  );
}
