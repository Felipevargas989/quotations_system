import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import MultiSelect from "../../components/MultiSelect";
import { toast } from "../../components/toast/Toast";
import {
  CampanaMarketing,
  editarCampanaMarketing,
  getAudienciasMarketing,
} from "../../services/marketing.service";
import { humanizeApiError } from "../../utils/apiErrors";
import CampanaMarcaPropia from "./CampanaMarcaPropia";
import {
  opcionesDeAudiencias,
  seleccionDeCampana,
  unaAudiencia,
} from "./audienciasDeCampana";

/**
 * EL EDITOR DEL BORRADOR (Felipe 26-08 texto, 28-08 completo): asunto,
 * preencabezado, título, cuerpo, AUDIENCIAS y marca propia. Guardar
 * INVALIDA la prueba — "sin prueba no hay envío" vale para la versión
 * real. Vive fuera de la ficha desde el 28-08: la cerca de tamaño la
 * pilló cruzando las 800 líneas (higuera).
 */
export default function EditorDeBorrador({
  campana,
  onListo,
  onCancelar,
}: {
  readonly campana: CampanaMarketing;
  readonly onListo: () => void;
  readonly onCancelar: () => void;
}) {
  const qc = useQueryClient();
  const [fAsunto, setFAsunto] = useState(campana.asunto);
  const [fPre, setFPre] = useState(campana.preencabezado ?? "");
  const [fTitulo, setFTitulo] = useState(campana.titulo);
  const [fCuerpo, setFCuerpo] = useState(campana.cuerpo);
  const [fBanner, setFBanner] = useState(campana.banner_url ?? "");
  const [fWhatsapp, setFWhatsapp] = useState(campana.whatsapp ?? "");
  const inicial = seleccionDeCampana(campana);
  const [fAuds, setFAuds] = useState<string[]>(inicial.valores);
  const audsAMedida = inicial.aMedida;
  const estanteria = useQuery({
    queryKey: ["marketing", "audiencias"],
    queryFn: getAudienciasMarketing,
    staleTime: 5 * 60_000,
  });

  // Los chips {nombre}/{empresa} insertan donde quedó el cursor.
  type CampoTag = "asunto" | "titulo" | "cuerpo";
  const [campoTag, setCampoTag] = useState<CampoTag>("cuerpo");
  const refAsunto = useRef<HTMLInputElement>(null);
  const refTitulo = useRef<HTMLInputElement>(null);
  const refCuerpo = useRef<HTMLTextAreaElement>(null);
  const refsTag = { asunto: refAsunto, titulo: refTitulo, cuerpo: refCuerpo };
  const valoresTag = { asunto: fAsunto, titulo: fTitulo, cuerpo: fCuerpo };
  const setsTag = { asunto: setFAsunto, titulo: setFTitulo, cuerpo: setFCuerpo };
  const insertarTag = (tag: string) => {
    const el = refsTag[campoTag].current;
    const valor = valoresTag[campoTag];
    const ini = el?.selectionStart ?? valor.length;
    const fin = el?.selectionEnd ?? ini;
    setsTag[campoTag](valor.slice(0, ini) + tag + valor.slice(fin));
    requestAnimationFrame(() => {
      el?.focus();
      el?.setSelectionRange(ini + tag.length, ini + tag.length);
    });
  };

  const guardar = useMutation({
    mutationFn: () =>
      editarCampanaMarketing(campana.id, {
        asunto: fAsunto.trim(),
        titulo: fTitulo.trim(),
        cuerpo: fCuerpo,
        ...(fPre.trim() ? { preencabezado: fPre.trim() } : {}),
        ...(fBanner ? { banner_url: fBanner } : {}),
        ...(fWhatsapp.trim() ? { whatsapp: fWhatsapp.trim() } : {}),
        ...(fAuds.length ? { audiencias: fAuds.map(unaAudiencia) } : {}),
      }),
    onSuccess: () => {
      toast.success(
        campana.prueba_enviada_at
          ? "Guardado. La prueba anterior quedó invalidada: mándate una nueva antes de enviar."
          : "Guardado.",
      );
      void qc.invalidateQueries({ queryKey: ["marketing"] });
      onListo();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const faltaAlgo = !fAsunto.trim() || !fTitulo.trim() || !fCuerpo.trim();

  return (
        <div className="space-y-3">
          <div className="flex items-center gap-1.5 flex-wrap text-xs text-gray-500">
            Insertar en {campoTag}:
            <button
              type="button"
              onClick={() => insertarTag("{nombre}")}
              className="px-2 py-0.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 font-mono"
            >
              {"{nombre}"}
            </button>
            <button
              type="button"
              onClick={() => insertarTag("{empresa}")}
              className="px-2 py-0.5 rounded-full border border-gray-200 text-gray-600 hover:bg-gray-50 font-mono"
            >
              {"{empresa}"}
            </button>
          </div>
          <label className="block text-sm">
            <span className="text-gray-600">Asunto</span>
            <input
              ref={refAsunto}
              value={fAsunto}
              onChange={(e) => setFAsunto(e.target.value)}
              onFocus={() => setCampoTag("asunto")}
              maxLength={200}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">
              Preencabezado (la frase gris de la bandeja, optativo)
            </span>
            <input
              value={fPre}
              onChange={(e) => setFPre(e.target.value)}
              maxLength={200}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Título grande del correo</span>
            <input
              ref={refTitulo}
              value={fTitulo}
              onChange={(e) => setFTitulo(e.target.value)}
              onFocus={() => setCampoTag("titulo")}
              maxLength={200}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="block text-sm">
            <span className="text-gray-600">Cuerpo</span>
            <textarea
              ref={refCuerpo}
              value={fCuerpo}
              onChange={(e) => setFCuerpo(e.target.value)}
              onFocus={() => setCampoTag("cuerpo")}
              rows={12}
              maxLength={8000}
              className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-sm font-medium text-gray-700 mb-2">
              ¿A quién va?
            </p>
            <MultiSelect
              options={opcionesDeAudiencias(estanteria.data)}
              value={fAuds}
              onChange={setFAuds}
              placeholder="Elegir una o varias audiencias…"
              buscador
              searchPlaceholder="Buscar audiencia por nombre…"
            />
            {audsAMedida && (
              <p className="text-[11px] text-amber-600 mt-1">
                Esta campaña usa un segmento a medida que no está
                guardado en la estantería: si eliges audiencias acá,
                lo reemplazas.
              </p>
            )}
          </div>
          <CampanaMarcaPropia
            bannerUrl={fBanner}
            whatsapp={fWhatsapp}
            onBanner={setFBanner}
            onWhatsapp={setFWhatsapp}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => guardar.mutate()}
              disabled={faltaAlgo || guardar.isPending}
              className="px-3 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-black disabled:opacity-40"
            >
              {guardar.isPending ? "Guardando…" : "Guardar"}
            </button>
            <button
              type="button"
              onClick={() => onCancelar()}
              className="px-3 py-2 text-sm rounded-lg text-gray-500 hover:bg-gray-100"
            >
              Cancelar
            </button>
            {campana.prueba_enviada_at && (
              <span className="text-xs text-amber-600">
                Al guardar se invalida la prueba: tendrás que probarte
                la versión nueva.
              </span>
            )}
          </div>
        </div>
  );
}
