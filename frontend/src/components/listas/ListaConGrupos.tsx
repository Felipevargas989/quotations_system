import { Fragment } from "react";
import type { Ref } from "react";
import { Pencil, Trash2 } from "lucide-react";
import ConfirmInline from "../ConfirmInline";

export interface FilaDeLista {
  id: number;
  /** El nombre completo: va en las preguntas y en las etiquetas. */
  nombre: string;
  /** Lo que se lee en la fila (bajo su título, sin repetir el grupo). */
  visible: string;
  /** Por persona; 0 = no se muestra. */
  precio: number;
  grupo: { id: number; name: string } | null;
  /** Apunte gris chico debajo del nombre (por ejemplo, la categoría). */
  detalle?: string;
}

/** Una pregunta que ocupa el lugar de su fila (borrar, o cargar sobre lo
 *  que ya hay). */
export interface PreguntaEnFila {
  id: number;
  pregunta: string;
  si: string;
  onSi: () => void | Promise<void>;
}

/**
 * UNA LISTA CON GRUPOS (12-10-2026). La pieza común de "Partir de un
 * paquete" y "Usar menú guardado" (Felipe: "¿podría este tener el mismo
 * diseño? ¿lo tenemos como pieza?"). Cada fila: nombre · precio por persona,
 * su lápiz (nombre y grupo) y su basurero. Un título por grupo con el MISMO
 * diseño de las secciones de SelectWithSearch y AgregadorDeItems; los sin
 * grupo, al final bajo "Otros". Sin grupos en la lista, no hay títulos.
 *
 * Recibe las filas ya ordenadas (utils/gruposDeLista) y ya filtradas por el
 * buscador: el buscador, el teclado y el panel son de quien la usa.
 */
export default function ListaConGrupos({
  filas,
  conTitulos,
  marcada,
  refMarcada,
  pregunta,
  onNo,
  onElegir,
  onEditar,
  onPedirEliminar,
  tituloEliminar = "Eliminar",
}: {
  readonly filas: FilaDeLista[];
  readonly conTitulos: boolean;
  readonly marcada?: number;
  readonly refMarcada?: Ref<HTMLButtonElement>;
  readonly pregunta: PreguntaEnFila | null;
  readonly onNo: () => void;
  readonly onElegir: (id: number) => void;
  readonly onEditar: (id: number) => void;
  readonly onPedirEliminar: (id: number) => void;
  readonly tituloEliminar?: string;
}) {
  return (
    <>
      {filas.map((fila, i) => {
        const anterior = i > 0 ? filas[i - 1] : undefined;
        const titulo =
          conTitulos &&
          (!anterior ||
            (anterior.grupo?.id ?? null) !== (fila.grupo?.id ?? null)) ? (
            <div className="px-3 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-gray-400 bg-gray-50">
              {fila.grupo?.name ?? "Otros"}
            </div>
          ) : null;

        if (pregunta?.id === fila.id) {
          return (
            <Fragment key={fila.id}>
              {titulo}
              <div className="px-3 py-2">
                <ConfirmInline
                  question={pregunta.pregunta}
                  yesLabel={pregunta.si}
                  onYes={pregunta.onSi}
                  onNo={onNo}
                />
              </div>
            </Fragment>
          );
        }

        return (
          <Fragment key={fila.id}>
            {titulo}
            <div
              className={`flex items-center justify-between px-3 py-2 hover:bg-gray-100 ${
                i === marcada ? "bg-blue-50" : ""
              }`}
            >
              <button
                type="button"
                ref={i === marcada ? refMarcada : undefined}
                onClick={() => onElegir(fila.id)}
                className="flex-1 min-w-0 text-left text-sm"
              >
                {/* El precio nunca se corta: si falta espacio, se corta
                    el nombre (Felipe, 06-10). */}
                <span className="flex items-baseline gap-1 min-w-0">
                  <span className="text-gray-900 truncate">{fila.visible}</span>
                  {fila.precio > 0 && (
                    <span className="text-gray-500 shrink-0 whitespace-nowrap">
                      · ${fila.precio.toLocaleString("es-CL")}
                    </span>
                  )}
                </span>
                {fila.detalle && (
                  <span className="block text-xs text-gray-400 truncate">
                    {fila.detalle}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onEditar(fila.id);
                }}
                className="ml-2 shrink-0 text-gray-400 hover:text-blue-600"
                title="Cambiar nombre o grupo"
                aria-label={`Editar ${fila.nombre}`}
              >
                <Pencil size={14} />
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onPedirEliminar(fila.id);
                }}
                className="ml-2 shrink-0 text-red-600 hover:text-red-800"
                title={tituloEliminar}
                aria-label={`Eliminar ${fila.nombre}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </Fragment>
        );
      })}
    </>
  );
}
