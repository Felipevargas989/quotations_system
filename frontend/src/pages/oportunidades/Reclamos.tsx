import { useQuery } from "@tanstack/react-query";
import { ClipboardCopy, ExternalLink, FileWarning } from "lucide-react";
import { useState } from "react";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import {
  getReclamos,
  type ReclamoArmado,
} from "../../services/comparacion.service";
import { hoyEnChile } from "../../utils/dates";

// LOS RECLAMOS, DESPUÉS DE LA RESOLUCIÓN (decisión 128 del doc 17, 11-11).
// Felipe, viendo «Redactar reclamo» en la tarjeta de la línea antes de que
// adjudicaran: "el reclamo creo que debe ser post resolución, si gano no
// reclamo, si pierdo sí, y debería ser una sección abajo para generar
// reclamos". Esta sección va al final de «Comparación de ofertas» y solo
// existe en una perdida: a quién se adjudicó, cuántos incumplimientos le
// encontró la comparación y «Generar reclamo», con el texto que arma el
// motor (pide dejar sin efecto la adjudicación), cuánto ocupa de los 3.500
// caracteres del formulario y hasta cuándo se reclama. Eventia no envía
// nada: se copia y se pega en reclamos de Mercado Público.

export const RECLAMOS_DE_MERCADO_PUBLICO =
  "https://reclamos.mercadopublico.cl/reclamos";

const SIN_ADJUDICAR = {
  desierta: "Quedó desierta",
  revocada: "Quedó revocada",
} as const;

/** «2026-11-27» → «27-11». */
const diaYMes = (dia: string) => `${dia.slice(8, 10)}-${dia.slice(5, 7)}`;

const enMiles = (n: number) => n.toLocaleString("es-CL");

type Paso = "cerrado" | "confirmar" | "falta" | "texto";

function UnReclamo({
  reclamo: r,
  maximo,
  unicaLinea,
}: {
  readonly reclamo: ReclamoArmado;
  readonly maximo: number;
  /** La licitación no tiene líneas: no hace falta nombrarla. */
  readonly unicaLinea: boolean;
}) {
  const [paso, setPaso] = useState<Paso>("cerrado");
  const texto = r.texto;
  const copiar = async () => {
    if (!texto) return;
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Texto copiado: pégalo en reclamos de Mercado Público.");
    } catch {
      toast.error("No se pudo copiar: selecciónalo y cópialo a mano.");
    }
  };
  const cuantos =
    r.incumplimientos + r.sin_lugar === 1
      ? "1 incumplimiento"
      : `${r.incumplimientos + r.sin_lugar} incumplimientos`;
  const generar = (
    <button
      type="button"
      onClick={() => setPaso(r.por_ausencia ? "confirmar" : "texto")}
      className="inline-flex shrink-0 items-center gap-1.5 px-3 py-2 text-sm font-semibold text-white bg-red-600 rounded-lg hover:bg-red-700"
    >
      <FileWarning size={14} /> Generar reclamo
    </button>
  );
  return (
    <li className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 text-sm text-gray-900">
          <span className="font-semibold">{r.corto}</span>
          {r.adjudicada ? " se adjudicó" : ""}
          {!unicaLinea && r.linea
            ? r.adjudicada
              ? ` la ${r.linea}`
              : ` · ${r.linea}`
            : ""}
          <span className="text-gray-600">
            {" · "}
            {texto ? cuantos : "sin incumplimientos a la vista"}
          </span>
        </p>
        {texto && paso === "cerrado" && generar}
      </div>
      {texto && paso === "confirmar" && (
        <ConfirmInline
          question={`¿Está todo lo que presentó ${r.corto}?`}
          yesLabel="Sí, está todo"
          tono="normal"
          onYes={() => setPaso("texto")}
          onNo={() => setPaso("falta")}
        />
      )}
      {texto && paso === "falta" && (
        <div className="space-y-1.5">
          <p className="text-xs text-amber-800">
            Trae o sube todo lo que presentó {r.corto} y vuelve a comparar antes
            de reclamar: lo que falta puede estar en lo que no llegó.
          </p>
          {generar}
        </div>
      )}
      {texto && paso === "texto" && (
        <div className="space-y-2">
          <textarea
            readOnly
            value={texto}
            rows={14}
            aria-label={`Reclamo sobre la oferta de ${r.corto}`}
            className="w-full p-2 text-xs text-gray-900 bg-white border border-gray-300 rounded-lg"
          />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p
              className={`text-xs ${r.caracteres > maximo ? "font-semibold text-red-700" : "text-gray-500"}`}
            >
              {enMiles(r.caracteres)} de {enMiles(maximo)} caracteres
              {r.sin_lugar > 0 &&
                ` · ${r.sin_lugar === 1 ? "1 incumplimiento no cupo" : `${r.sin_lugar} incumplimientos no cupieron`}`}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void copiar()}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                <ClipboardCopy size={13} /> Copiar
              </button>
              <a
                href={RECLAMOS_DE_MERCADO_PUBLICO}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-800"
              >
                Ir a reclamos de Mercado Público <ExternalLink size={12} />
              </a>
            </div>
          </div>
          <p className="text-xs text-gray-600">
            Va como «Irregularidad en el proceso de compra». Antes, revisa que
            cada dato sea cierto: lo encontró la IA. Eventia no envía nada.
          </p>
        </div>
      )}
    </li>
  );
}

/** Un plazo: «Reclamo: hasta el 27-11», o «venció el 27-11» si ya pasó. */
function Plazo({
  que,
  hasta,
  detalle,
}: {
  readonly que: string;
  readonly hasta: string | null;
  readonly detalle: string;
}) {
  if (!hasta) return null;
  const vencido = hasta < hoyEnChile();
  return (
    <span
      title={detalle}
      className={`inline-block px-2 py-0.5 text-xs font-semibold rounded whitespace-nowrap ${
        vencido ? "bg-gray-100 text-gray-600" : "bg-red-100 text-red-800"
      }`}
    >
      {que}: {vencido ? "venció el" : "hasta el"} {diaYMes(hasta)}
    </span>
  );
}

export default function Reclamos({
  oportunidadId,
  comparacionId = null,
}: {
  readonly oportunidadId: number;
  /** La comparación lista: con una nueva, los reclamos se piden de nuevo. */
  readonly comparacionId?: number | null;
}) {
  const { data } = useQuery({
    queryKey: ["oportunidades", "reclamos", oportunidadId, comparacionId],
    queryFn: () => getReclamos(oportunidadId),
    // Con una comparación nueva se piden de nuevo, sin que la sección
    // desaparezca mientras llegan.
    placeholderData: (anterior) => anterior,
  });
  // Si gano no reclamo; antes de la resolución, tampoco.
  if (!data?.corresponde) return null;
  const unicaLinea = data.reclamos.every((r) => !r.linea);
  return (
    <section
      aria-label="Reclamos"
      className="rounded-xl border-2 border-red-300 bg-white p-4 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-900">Reclamos</h3>
        <div className="flex flex-wrap items-center gap-2">
          <Plazo
            que="Reclamo"
            hasta={data.reclamo_hasta}
            detalle="5 días hábiles desde la adjudicación (Ley de Compras, art. 30 bis). Sin descontar feriados."
          />
          <Plazo
            que="Tribunal"
            hasta={data.tribunal_hasta}
            detalle="10 días hábiles desde la adjudicación, ante el Tribunal de Contratación Pública (art. 24 ter). Sin descontar feriados: confírmalo con tu abogado."
          />
        </div>
      </div>
      {data.sin_adjudicar ? (
        <p className="text-sm text-gray-700">
          {SIN_ADJUDICAR[data.sin_adjudicar]}: no hay oferta adjudicada a la que
          reclamarle.
        </p>
      ) : !data.comparada ? (
        <p className="text-sm text-gray-700">
          Compara las ofertas primero: el reclamo sale de lo que encuentra la
          comparación.
        </p>
      ) : data.reclamos.length === 0 ? (
        <p className="text-sm text-gray-700">
          La comparación no encontró incumplimientos en las ofertas que compiten
          contigo.
        </p>
      ) : (
        <ul className="space-y-3">
          {data.reclamos.map((r) => (
            <UnReclamo
              key={`${r.linea}|${r.contra}`}
              reclamo={r}
              maximo={data.maximo}
              unicaLinea={unicaLinea}
            />
          ))}
        </ul>
      )}
    </section>
  );
}
