import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import {
  FileText,
  Inbox,
  Search,
  Settings2,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import ConfirmInline from "../../components/ConfirmInline";
import { toast } from "../../components/toast/Toast";
import { humanizeApiError } from "../../utils/apiErrors";
import { matchesSearch } from "../../utils/searchMatch";
import { formatISOUTCDateToString } from "../../utils/dates";
import { EventType } from "../../types/quotations.types";
import {
  convertirConsulta,
  descartarConsulta,
  getConfigsDeConsulta,
  getConsultas,
  guardarConfigDeConsulta,
  type Brochure,
  type Consulta,
} from "../../services/consultas.service";
import { uploadConsultaBrochure } from "../../services/storage.service";

/**
 * EL EMBUDO DE CONSULTAS (Felipe, 05-09 — doc 12). Las consultas
 * masivas (matrimonio, paseo de curso, graduación) ya no crean
 * cotizaciones: quedan acá con su brochure enviado al tiro, y solo
 * las que CONTESTAN se convierten — un clic, el cliente nace o se
 * matchea, y el cotizador se abre con él puesto.
 *
 * El embudo se activa por configuración: un tipo de evento filtra
 * cuando tiene brochure(s). Eso se administra acá mismo, en la
 * pestaña Configuración.
 */

const fmtFecha = (iso: string) =>
  new Date(iso).toLocaleDateString("es-CL", {
    day: "2-digit",
    month: "short",
  });

const chipEstado = (c: Consulta) => {
  if (c.estado === "convertida")
    return "bg-blue-50 text-blue-700 border-blue-200";
  if (c.estado === "descartada")
    return "bg-gray-100 text-gray-500 border-gray-200";
  if (!c.correo_enviado) return "bg-amber-50 text-amber-700 border-amber-200";
  return "bg-emerald-50 text-emerald-700 border-emerald-200";
};

const textoEstado = (c: Consulta) => {
  if (c.estado === "convertida") return "Convertida";
  if (c.estado === "descartada") return "Descartada";
  if (!c.correo_enviado) return "Sin brochure";
  return "Respondida";
};

export default function ConsultasPage() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [pestana, setPestana] = useState<"bandeja" | "config">("bandeja");
  const [busqueda, setBusqueda] = useState("");
  const [filtro, setFiltro] = useState<"todas" | Consulta["estado"]>("todas");
  const [confirmando, setConfirmando] = useState<{
    id: number;
    accion: "convertir" | "descartar";
  } | null>(null);

  const { data: consultas = [], isLoading } = useQuery({
    queryKey: ["consultas"],
    queryFn: getConsultas,
  });
  const { data: configs = [] } = useQuery({
    queryKey: ["consultas", "config"],
    queryFn: getConfigsDeConsulta,
  });
  const refrescar = () => {
    void qc.invalidateQueries({ queryKey: ["consultas"] });
  };

  const convertir = useMutation({
    mutationFn: (id: number) => convertirConsulta(id),
    onSuccess: (r) => {
      toast.success("Cliente listo: se abre el cotizador con él puesto.");
      refrescar();
      navigate("/quotation-form", { state: { clientId: r.client_id } });
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });
  const descartar = useMutation({
    mutationFn: (id: number) => descartarConsulta(id),
    onSuccess: () => {
      setConfirmando(null);
      refrescar();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const filtradas = useMemo(
    () =>
      consultas.filter(
        (c) =>
          (filtro === "todas" || c.estado === filtro) &&
          (!busqueda.trim() ||
            matchesSearch(busqueda, c.name, c.email, c.phone, c.event_type)),
      ),
    [consultas, filtro, busqueda],
  );

  const chipFiltro = (activo: boolean) =>
    `px-2.5 py-1 text-xs rounded-full border tabular-nums ${
      activo
        ? "bg-blue-50 text-blue-700 border-blue-300 font-medium"
        : "text-gray-600 border-gray-200 hover:bg-gray-50"
    }`;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <h1 className="text-2xl font-bold text-gray-900">Consultas</h1>
        <span className="text-sm text-gray-500">
          las masivas quedan acá; solo las que contestan se vuelven cotización
        </span>
        <span className="flex-1" />
        <button
          type="button"
          onClick={() =>
            setPestana(pestana === "bandeja" ? "config" : "bandeja")
          }
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          {pestana === "bandeja" ? (
            <>
              <Settings2 className="w-4 h-4" /> Configurar el embudo
            </>
          ) : (
            <>
              <Inbox className="w-4 h-4" /> Volver a la bandeja
            </>
          )}
        </button>
      </div>

      {pestana === "config" ? (
        <ConfiguracionDelEmbudo configs={configs} />
      ) : (
        <>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search
                size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none"
              />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por nombre, correo, tipo…"
                className="pl-8 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm w-64"
                aria-label="Buscar consulta"
              />
            </div>
            <button
              type="button"
              onClick={() => setFiltro("todas")}
              className={chipFiltro(filtro === "todas")}
            >
              Todas ({consultas.length})
            </button>
            <button
              type="button"
              onClick={() => setFiltro("respondida")}
              className={chipFiltro(filtro === "respondida")}
            >
              Respondidas (
              {consultas.filter((c) => c.estado === "respondida").length})
            </button>
            <button
              type="button"
              onClick={() => setFiltro("convertida")}
              className={chipFiltro(filtro === "convertida")}
            >
              Convertidas (
              {consultas.filter((c) => c.estado === "convertida").length})
            </button>
            <button
              type="button"
              onClick={() => setFiltro("descartada")}
              className={chipFiltro(filtro === "descartada")}
            >
              Descartadas (
              {consultas.filter((c) => c.estado === "descartada").length})
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="px-3 py-2.5">Llegó</th>
                  <th className="px-3 py-2.5">Quién</th>
                  <th className="px-3 py-2.5">Tipo de evento</th>
                  <th className="px-3 py-2.5">Fecha tentativa</th>
                  <th className="px-3 py-2.5 text-right">Personas</th>
                  <th className="px-3 py-2.5 text-center">Estado</th>
                  <th className="px-3 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {filtradas.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-gray-100 hover:bg-gray-50"
                  >
                    <td className="px-3 py-2.5 text-gray-500 whitespace-nowrap tabular-nums">
                      {fmtFecha(c.created_at)}
                    </td>
                    <td className="px-3 py-2.5">
                      <p className="text-gray-900 font-medium">{c.name}</p>
                      <p className="text-xs text-gray-500">
                        {c.email} · {c.phone}
                      </p>
                    </td>
                    <td className="px-3 py-2.5 text-gray-700">
                      {c.event_type}
                    </td>
                    <td className="px-3 py-2.5 text-gray-700 whitespace-nowrap">
                      {c.event_date
                        ? formatISOUTCDateToString(c.event_date.slice(0, 10))
                        : "—"}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {c.people_count ?? "—"}
                    </td>
                    <td className="px-3 py-2.5 text-center">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full border whitespace-nowrap ${chipEstado(c)}`}
                        title={
                          !c.correo_enviado && c.estado === "respondida"
                            ? "El brochure no salió (o ya lo recibió hace poco)"
                            : undefined
                        }
                      >
                        {textoEstado(c)}
                      </span>
                    </td>
                    <td className="px-3 py-2.5">
                      {c.estado !== "convertida" &&
                        (confirmando?.id === c.id ? (
                          <ConfirmInline
                            question={
                              confirmando.accion === "convertir"
                                ? "¿Convertir en cotización? El cliente nace (o se matchea) y se abre el cotizador."
                                : "¿Descartar esta consulta?"
                            }
                            yesLabel={
                              confirmando.accion === "convertir"
                                ? "Sí, convertir"
                                : "Sí, descartar"
                            }
                            onYes={() => {
                              if (confirmando.accion === "convertir") {
                                convertir.mutate(c.id);
                              } else {
                                descartar.mutate(c.id);
                              }
                            }}
                            onNo={() => setConfirmando(null)}
                          />
                        ) : (
                          <span className="flex items-center gap-1 justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmando({
                                  id: c.id,
                                  accion: "convertir",
                                })
                              }
                              title="Convertir en cotización"
                              className="flex items-center gap-1 px-2 py-1 text-xs rounded-lg border border-gray-200 text-blue-700 hover:bg-blue-50"
                            >
                              <UserPlus className="w-3.5 h-3.5" /> Convertir
                            </button>
                            {c.estado === "respondida" && (
                              <button
                                type="button"
                                onClick={() =>
                                  setConfirmando({
                                    id: c.id,
                                    accion: "descartar",
                                  })
                                }
                                title="Descartar"
                                className="p-1 text-gray-300 hover:text-red-600 rounded"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </span>
                        ))}
                    </td>
                  </tr>
                ))}
                {filtradas.length === 0 && (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-3 py-8 text-center text-sm text-gray-400"
                    >
                      {isLoading
                        ? "Cargando…"
                        : consultas.length === 0
                          ? "Aún no llegan consultas. Llegarán solas cuando un tipo de evento tenga brochure configurado."
                          : "Ninguna calza con el filtro."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

/** La configuración del embudo: por tipo de evento, sus brochures
 *  (hasta 2 PDF) y el texto del correo. Con brochures = embudo activo. */
function ConfiguracionDelEmbudo({
  configs,
}: {
  readonly configs: readonly {
    event_type: string;
    texto: string | null;
    brochures: Brochure[];
  }[];
}) {
  const qc = useQueryClient();
  const tipos = Object.values(EventType);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <p className="lg:col-span-2 text-sm text-gray-500">
        Un tipo de evento entra al embudo cuando tiene brochure: sus
        consultas del formulario público dejan de crear cotizaciones,
        quedan en la bandeja y reciben el correo con los adjuntos al tiro.
        Sin brochure, ese tipo sigue creando cotización como siempre.
      </p>
      {tipos.map((tipo) => (
        <TarjetaDeTipo
          key={tipo}
          tipo={tipo}
          config={configs.find((c) => c.event_type === tipo) ?? null}
          onCambio={() =>
            void qc.invalidateQueries({ queryKey: ["consultas", "config"] })
          }
        />
      ))}
    </div>
  );
}

function TarjetaDeTipo({
  tipo,
  config,
  onCambio,
}: {
  readonly tipo: string;
  readonly config: {
    texto: string | null;
    brochures: Brochure[];
  } | null;
  readonly onCambio: () => void;
}) {
  const [texto, setTexto] = useState(config?.texto ?? "");
  const [subiendo, setSubiendo] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const brochures = config?.brochures ?? [];
  const activo = brochures.length > 0;

  const guardar = useMutation({
    mutationFn: (cambios: { texto?: string | null; brochures?: Brochure[] }) =>
      guardarConfigDeConsulta(tipo, cambios),
    onSuccess: () => {
      toast.success(`${tipo}: configuración guardada`);
      onCambio();
    },
    onError: (e: unknown) => toast.error(humanizeApiError(e)),
  });

  const subirArchivo = async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("El brochure debe ser un PDF.");
      return;
    }
    setSubiendo(true);
    try {
      const r = await uploadConsultaBrochure(file, tipo);
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
    <div className="bg-white rounded-xl border border-gray-200 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <h3 className="font-semibold text-gray-900">{tipo}</h3>
        <span
          className={`text-xs px-2 py-0.5 rounded-full border ${
            activo
              ? "bg-emerald-50 text-emerald-700 border-emerald-200"
              : "text-gray-400 border-gray-200"
          }`}
        >
          {activo ? "en el embudo" : "sin embudo"}
        </span>
      </div>

      <div className="space-y-1.5">
        {brochures.map((b) => (
          <div
            key={b.path}
            className="flex items-center gap-2 text-sm bg-gray-50 rounded-lg px-2.5 py-1.5"
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
              disabled={subiendo}
              className="text-sm text-blue-600 hover:underline disabled:opacity-50"
            >
              {subiendo ? "Subiendo…" : "+ Subir brochure (PDF, máx. 5MB)"}
            </button>
          </>
        )}
      </div>

      <div className="space-y-1">
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={4}
          placeholder="Texto del correo (vacío = el de la casa). Usa {nombre} para saludar."
          className="w-full border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm"
          aria-label={`Texto del correo de ${tipo}`}
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
