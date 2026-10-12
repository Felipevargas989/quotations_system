import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import Modal from "../Modal";
import ConfirmInline from "../ConfirmInline";
import { useGruposDePaquetes } from "../../hooks/useGruposDePaquetes";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  GrupoDePaquetes,
  ServiceGroupCollection,
} from "../../types/serviceGroupCollections.types";

/**
 * "ORDENAR GRUPOS…" (12-10-2026, migración 120). Felipe: "mejor crear y
 * editar listas, es más fácil que una sección que se arme por el nombre
 * del paquete". Crear, renombrar, subir y bajar, y borrar los grupos de
 * "Partir de un paquete". Mismo trato que "Gestionar tipos" de Clientes:
 * flechas para el orden, la pregunta de borrar en su lugar. Borrar un
 * grupo NO borra sus paquetes: pasan a "Otros".
 */
export default function GruposDePaquetes({
  paquetes,
  onCerrar,
}: {
  readonly paquetes: ServiceGroupCollection[];
  readonly onCerrar: () => void;
}) {
  const { grupos, crear, renombrar, ordenar, borrar } = useGruposDePaquetes();
  const [nuevo, setNuevo] = useState("");
  const [editando, setEditando] = useState<{
    id: GrupoDePaquetes["id"];
    nombre: string;
  } | null>(null);
  const [borrandoId, setBorrandoId] = useState<GrupoDePaquetes["id"] | null>(
    null,
  );
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cuantos = (id: GrupoDePaquetes["id"]) =>
    paquetes.filter((p) => p.package_group_id === id).length;

  const intentar = async (accion: () => Promise<void>, falla: string) => {
    if (ocupado) return false;
    setOcupado(true);
    setError(null);
    try {
      await accion();
      return true;
    } catch (e) {
      setError(humanizeApiError(e, falla));
      return false;
    } finally {
      setOcupado(false);
    }
  };

  const agregar = async () => {
    const nombre = nuevo.trim();
    if (!nombre) return;
    if (await intentar(() => crear(nombre), "No se pudo crear el grupo.")) {
      setNuevo("");
    }
  };

  const guardarNombre = async () => {
    if (!editando || !editando.nombre.trim()) return;
    const { id, nombre } = editando;
    if (
      await intentar(
        () => renombrar(id, nombre.trim()),
        "No se pudo renombrar el grupo.",
      )
    ) {
      setEditando(null);
    }
  };

  const mover = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= grupos.length) return;
    const ids = grupos.map((g) => g.id);
    [ids[i], ids[j]] = [ids[j], ids[i]];
    void intentar(() => ordenar(ids), "No se pudo cambiar el orden.");
  };

  const quitar = async (id: GrupoDePaquetes["id"]) => {
    await intentar(() => borrar(id), "No se pudo borrar el grupo.");
    setBorrandoId(null);
  };

  return (
    <Modal
      titulo="Grupos de paquetes"
      subtitulo="Ordenan «Partir de un paquete»: un título por grupo y, dentro, de menor a mayor precio."
      ancho="max-w-md"
      onCerrar={onCerrar}
      pie={
        <button
          type="button"
          onClick={onCerrar}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white hover:bg-blue-700"
        >
          Listo
        </button>
      }
    >
      {grupos.length === 0 && (
        <p className="text-sm text-gray-500 mb-3">
          Aún no hay grupos. Crea el primero abajo.
        </p>
      )}
      <ul className="divide-y divide-gray-100 mb-4">
        {grupos.map((g, i) => (
          <li key={g.id} className="py-2">
            {borrandoId === g.id ? (
              <ConfirmInline
                question={`¿Borrar «${g.name}»? ${
                  cuantos(g.id) === 1
                    ? "Su paquete pasa"
                    : `Sus ${cuantos(g.id)} paquetes pasan`
                } a «Otros».`}
                yesLabel="Sí, borrar"
                onYes={() => void quitar(g.id)}
                onNo={() => setBorrandoId(null)}
              />
            ) : editando?.id === g.id ? (
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  autoFocus
                  value={editando.nombre}
                  onChange={(e) =>
                    setEditando({ id: g.id, nombre: e.target.value })
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void guardarNombre();
                    if (e.key === "Escape") setEditando(null);
                  }}
                  aria-label="Nuevo nombre del grupo"
                  className="flex-1 px-2 py-1 border border-gray-300 rounded-lg text-sm"
                />
                <button
                  type="button"
                  onClick={() => void guardarNombre()}
                  disabled={ocupado || !editando.nombre.trim()}
                  className="px-2 py-1 text-sm font-semibold text-blue-600 hover:text-blue-800 disabled:text-gray-300"
                >
                  Guardar
                </button>
                <button
                  type="button"
                  onClick={() => setEditando(null)}
                  className="px-2 py-1 text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <span className="flex-1 min-w-0 text-sm text-gray-900 truncate">
                  {g.name}
                  <span className="ml-2 text-xs text-gray-400">
                    {cuantos(g.id) === 1
                      ? "1 paquete"
                      : `${cuantos(g.id)} paquetes`}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => mover(i, -1)}
                  disabled={ocupado || i === 0}
                  className="p-1 text-gray-500 hover:text-gray-800 disabled:text-gray-200"
                  title="Subir"
                  aria-label={`Subir ${g.name}`}
                >
                  <ArrowUp size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => mover(i, 1)}
                  disabled={ocupado || i === grupos.length - 1}
                  className="p-1 text-gray-500 hover:text-gray-800 disabled:text-gray-200"
                  title="Bajar"
                  aria-label={`Bajar ${g.name}`}
                >
                  <ArrowDown size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setEditando({ id: g.id, nombre: g.name })}
                  className="p-1 text-gray-500 hover:text-blue-600"
                  title="Cambiar el nombre"
                  aria-label={`Cambiar el nombre de ${g.name}`}
                >
                  <Pencil size={14} />
                </button>
                <button
                  type="button"
                  onClick={() => setBorrandoId(g.id)}
                  className="p-1 text-red-600 hover:text-red-800"
                  title="Borrar el grupo"
                  aria-label={`Borrar ${g.name}`}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        <input
          type="text"
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void agregar()}
          placeholder="Nuevo grupo, ej: Full day"
          aria-label="Nombre del grupo nuevo"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
        />
        <button
          type="button"
          onClick={() => void agregar()}
          disabled={ocupado || !nuevo.trim()}
          className="px-3 py-2 rounded-lg text-sm font-semibold flex items-center gap-1 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
        >
          <Plus size={14} />
          Agregar
        </button>
      </div>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
