import { useQuery } from "@tanstack/react-query";
import { ExternalLink } from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import Modal from "../../components/Modal";
import {
  getFichaDeOportunidad,
  type EstadoOportunidad,
  type Oportunidad,
} from "../../services/oportunidades.service";
import { formatCurrency } from "../../utils/currencies";
import { formatMomento } from "../../utils/dates";
import Ganadores from "./Ganadores";
import {
  ALERTAS,
  cuandoCierra,
  esPrioridad,
  ESTADOS,
  ETIQUETAS,
  SEMAFOROS,
  TIPOS,
  urlMercadoPublico,
} from "./oportunidades.utils";

// EL PANEL DE DETALLE (doc 17, sprint 3, paso 1b). Felipe, 17-10, con el
// pantallazo de Licify: "pinchar un modal con el detalle, la opción de ver
// la ficha; ahí podríamos poner un en estudio o descartar". Lo de arriba
// sale al tiro de la fila; la descripción, los productos y el año anterior
// llegan con la ficha (la misma consulta que usa la ficha completa: al
// pasar a ella ya está cargada).

const LARGO_DE_LA_DESCRIPCION = 600;

export default function PanelDeOportunidad({
  o,
  ocupado,
  onDecidir,
  onCerrar,
}: {
  readonly o: Oportunidad;
  readonly ocupado: boolean;
  readonly onDecidir: (estado: EstadoOportunidad) => void;
  readonly onCerrar: () => void;
}) {
  const { data: ficha } = useQuery({
    queryKey: ["oportunidades", "ficha", o.id],
    queryFn: () => getFichaDeOportunidad(o.id),
  });
  const p = o.proceso;
  const cierre = cuandoCierra(p.fecha_cierre);
  const estado = ESTADOS.find((e) => e.value === o.estado);
  const descripcion = ficha?.proceso.descripcion?.trim() ?? "";
  const productos = ficha?.proceso.productos ?? [];

  return (
    <Modal
      titulo={p.nombre}
      subtitulo={
        <span className="flex flex-wrap items-center gap-1.5 mt-1">
          <Chip>{TIPOS[p.tipo]}</Chip>
          <Chip oscuro>{o.codigo}</Chip>
          {o.semaforo && (
            <Chip>
              <span
                className={`inline-block w-2 h-2 mr-1 rounded-full ${SEMAFOROS[o.semaforo].punto}`}
              />
              {SEMAFOROS[o.semaforo].label}
            </Chip>
          )}
          {esPrioridad(o) && <Chip ambar>Prioridad</Chip>}
          {estado && o.estado !== "nueva" && (
            <span className={`px-2 py-0.5 text-xs rounded ${estado.clases}`}>
              {estado.label}
            </span>
          )}
          <span
            className={`text-xs ${cierre.urgente ? "font-semibold text-red-600" : "text-gray-500"}`}
          >
            {cierre.texto}
          </span>
        </span>
      }
      onCerrar={onCerrar}
      pie={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <a
            href={urlMercadoPublico(o.codigo, p.tipo)}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-700 hover:underline"
          >
            Mercado Público <ExternalLink size={13} />
          </a>
          <div className="flex flex-wrap gap-2">
            {o.estado === "nueva" && (
              <>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => onDecidir("descartada")}
                  className="px-3 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                >
                  Descartar
                </button>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => onDecidir("en_estudio")}
                  className="px-3 py-2 text-sm font-semibold text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 disabled:opacity-50"
                >
                  Me interesa
                </button>
              </>
            )}
            {o.estado === "descartada" && (
              <button
                type="button"
                disabled={ocupado}
                onClick={() => onDecidir("nueva")}
                className="px-3 py-2 text-sm font-semibold text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 disabled:opacity-50"
              >
                Recuperar
              </button>
            )}
            <Link
              to={`/oportunidades/${o.id}`}
              className="px-3 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Ver ficha completa
            </Link>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        {o.razon && (
          <div className="space-y-1.5">
            <p className="text-sm text-gray-800">{o.razon}</p>
            <div className="flex flex-wrap gap-1.5">
              {o.alertas.map((a) => (
                <span
                  key={a}
                  className="px-2 py-0.5 text-xs rounded bg-blue-50 text-blue-700"
                >
                  {ALERTAS[a] ?? a}
                </span>
              ))}
              {o.etiquetas
                .filter((e) => e !== "otro")
                .map((e) => (
                  <span
                    key={e}
                    className="px-2 py-0.5 text-xs rounded bg-gray-100 text-gray-600"
                  >
                    {ETIQUETAS[e] ?? e}
                  </span>
                ))}
            </div>
          </div>
        )}

        {descripcion && (
          <p className="text-sm text-gray-600 whitespace-pre-line">
            {descripcion.length > LARGO_DE_LA_DESCRIPCION
              ? `${descripcion.slice(0, LARGO_DE_LA_DESCRIPCION)}…`
              : descripcion}
          </p>
        )}

        {productos.length > 0 && (
          <div className="space-y-1.5">
            <h3 className="text-sm font-semibold text-gray-900">
              Productos solicitados ({productos.length})
            </h3>
            <ul className="space-y-1.5">
              {productos.slice(0, 8).map((x, i) => (
                <li key={i} className="flex items-start gap-3">
                  <span className="shrink-0 min-w-[3rem] px-2 py-1 text-center text-sm font-semibold text-gray-900 rounded bg-gray-100">
                    {x.cantidad ?? "—"}
                  </span>
                  <span className="text-sm text-gray-700">
                    {x.nombre}
                    {x.descripcion ? `: ${x.descripcion}` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {productos.length > 8 && (
              <p className="text-xs text-gray-500">
                Y {productos.length - 8} más en la ficha completa.
              </p>
            )}
          </div>
        )}

        <dl className="divide-y divide-gray-100 border-t border-gray-100 text-sm">
          <Fila titulo="Organismo">{p.organismo ?? "—"}</Fila>
          <Fila titulo="Monto">
            {p.monto ? formatCurrency(p.monto, "CLP") : "No informado"}
          </Fila>
          <Fila titulo="Ubicación">
            {[p.comuna, p.region].filter(Boolean).join(" · ") || "—"}
          </Fila>
          <Fila titulo="Publicación">
            {formatMomento(p.fecha_publicacion, "diaHora")}
          </Fila>
          <Fila titulo="Cierre">
            {formatMomento(p.fecha_cierre, "diaHora", "Sin fecha")}
          </Fila>
          {(ficha?.anterior ?? o.anterior) && (
            <Fila titulo="El año anterior">
              {(() => {
                const a = (ficha?.anterior ?? o.anterior)!;
                return (
                  <>
                    {a.anio ?? "Antes"}: ganó{" "}
                    <Ganadores ganadores={a.ganadores} />
                    {a.oferentes != null &&
                      ` · ${a.oferentes} ${a.oferentes === 1 ? "oferta" : "ofertas"}`}
                  </>
                );
              })()}
            </Fila>
          )}
        </dl>
      </div>
    </Modal>
  );
}

function Chip({
  children,
  oscuro = false,
  ambar = false,
}: {
  readonly children: ReactNode;
  readonly oscuro?: boolean;
  readonly ambar?: boolean;
}) {
  const clases = oscuro
    ? "bg-gray-800 text-white"
    : ambar
      ? "bg-amber-100 text-amber-800"
      : "bg-gray-100 text-gray-700";
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs font-semibold rounded ${clases}`}
    >
      {children}
    </span>
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
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-gray-500">{titulo}</dt>
      <dd className="text-right font-medium text-gray-900">{children}</dd>
    </div>
  );
}
