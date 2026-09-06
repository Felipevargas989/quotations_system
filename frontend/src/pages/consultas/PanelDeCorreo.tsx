import { useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { FileText, X } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  guardarConfigDeConsulta,
  type Brochure,
} from "../../services/consultas.service";
import { type TipoDeEvento } from "../../services/eventTypes.service";
import { uploadConsultaBrochure } from "../../services/storage.service";

/** El correo del embudo de UN tipo: sus brochures (hasta 2 PDF) y el
 *  texto (vacío = el de la casa). */
export default function PanelDeCorreo({
  tipo,
  config,
  onCambio,
  onCerrar,
}: {
  readonly tipo: TipoDeEvento;
  readonly config: {
    texto: string | null;
    brochures: Brochure[];
  } | null;
  readonly onCambio: () => void;
  readonly onCerrar: () => void;
}) {
  const [texto, setTexto] = useState(config?.texto ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const guardar = useMutation({
    mutationFn: (cambios: { texto?: string | null; brochures?: Brochure[] }) =>
      guardarConfigDeConsulta(tipo.name, cambios),
    onSuccess: (_r, cambios) => {
      toast.success(`${tipo.name}: configuración guardada`);
      onCambio();
      // Guardado el TEXTO, la configuración quedó lista y el panel se
      // recoge (Felipe, 06-09: "que se cierre para que el campo no
      // quede siempre abierto"). Subir un brochure NO cierra: uno
      // suele seguir con el segundo PDF o con el texto.
      if ('texto' in cambios) onCerrar();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  // La lista fresca: si recién se guardó, manda la respuesta del
  // servidor — el cierre del render queda viejo entre el guardar y el
  // refresco de la query, y subir el 2.º PDF muy rápido pisaba al 1.º
  // (revisión 06-09).
  const brochures = guardar.data?.brochures ?? config?.brochures ?? [];

  const subirArchivo = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("El brochure debe ser un PDF.");
      return;
    }
    setSubiendo(true);
    try {
      const r = await uploadConsultaBrochure(file, tipo.name);
      if (!r.success || !r.url) throw new Error(r.error);
      guardar.mutate({
        brochures: [
          ...brochures,
          { nombre: file.name, path: r.url, bytes: file.size },
        ],
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo subir");
    } finally {
      setSubiendo(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-gray-600">
          Brochures adjuntos (hasta 2 PDF)
        </p>
        {brochures.map((b) => (
          <div
            key={b.path}
            className="flex items-center gap-2 text-sm bg-white border border-gray-200 rounded-lg px-2.5 py-1.5"
          >
            <FileText className="w-4 h-4 text-gray-400 shrink-0" />
            <span className="flex-1 truncate text-gray-700">{b.nombre}</span>
            <button
              type="button"
              onClick={() =>
                guardar.mutate({
                  brochures: brochures.filter((x) => x.path !== b.path),
                })
              }
              title="Quitar este brochure"
              className="p-0.5 text-gray-300 hover:text-red-600 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
        {brochures.length < 2 && (
          <>
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void subirArchivo(f);
              }}
            />
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={subiendo || guardar.isPending}
              className="text-sm text-blue-600 hover:underline disabled:opacity-50"
            >
              {subiendo ? "Subiendo…" : "+ Subir brochure (PDF, máx. 5MB)"}
            </button>
          </>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-xs font-medium text-gray-600">Texto del correo</p>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={5}
          placeholder="Vacío = el texto de la casa. Usa {nombre} para saludar."
          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
          aria-label={`Texto del correo de ${tipo.name}`}
        />
        {(texto.trim() || "") !== (config?.texto?.trim() || "") && (
          <button
            type="button"
            onClick={() => guardar.mutate({ texto: texto.trim() || null })}
            disabled={guardar.isPending}
            className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50"
          >
            Guardar texto
          </button>
        )}
      </div>
    </div>
  );
}
