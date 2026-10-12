import { useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2 } from "lucide-react";
import Modal from "../Modal";
import ConfirmInline from "../ConfirmInline";
import { humanizeApiError } from "../../utils/apiErrors";

interface Grupo {
  id: number;
  name: string;
}

/**
 * "ORDENAR GRUPOS…" (12-10-2026). Felipe: "mejor crear y editar listas".
 * Pieza común de "Partir de un paquete" y "Usar menú guardado": crear,
 * renombrar, subir y bajar, y borrar los grupos de una lista. Mismo trato
 * que "Gestionar tipos" de Clientes: flechas para el orden, la pregunta de
 * borrar en su lugar. Borrar un grupo NO borra lo que tiene: pasa a "Otros".
 */
export default function GruposDeLista({
  titulo,
  subtitulo,
  grupos,
  cuantos,
  unidad,
  crear,
  renombrar,
  ordenar,
  borrar,
  onCerrar,
}: {
  readonly titulo: string;
  readonly subtitulo: string;
  /** En su orden actual, de arriba abajo. */
  readonly grupos: readonly Grupo[];
  /** Cuántos elementos tiene cada grupo. */
  readonly cuantos: (id: number) => number;
  /** Cómo se llama lo que se agrupa: { uno: "paquete", varios: "paquetes" }. */
  readonly unidad: { uno: string; varios: string };
  readonly crear: (nombre: string) => Promise<void>;
  readonly renombrar: (id: number, nombre: string) => Promise<void>;
  readonly ordenar: (ids: number[]) => Promise<void>;
  readonly borrar: (id: number) => Promise<void>;
  readonly onCerrar: () => void;
}) {
  const [nuevo, setNuevo] = useState("");
  const [editando, setEditando] = useState<{
    id: number;
    nombre: string;
  } | null>(null);
  const [borrandoId, setBorrandoId] = useState<number | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cuenta = (id: number) =>
    cuantos(id) === 1 ? `1 ${unidad.uno}` : `${cuantos(id)} ${unidad.varios}`;

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

  const quitar = async (id: number) => {
    await intentar(() => borrar(id), "No se pudo borrar el grupo.");
    setBorrandoId(null);
  };

  return (
    <Modal
      titulo={titulo}
      subtitulo={subtitulo}
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
                    ? `Su ${unidad.uno} pasa`
                    : `Sus ${cuantos(g.id)} ${unidad.varios} pasan`
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
                    {cuenta(g.id)}
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
          placeholder="Nuevo grupo"
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
