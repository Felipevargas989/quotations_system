import { useState } from "react";
import { Save } from "lucide-react";
import Modal from "../Modal";
import ElegirGrupo from "./ElegirGrupo";
import { toast } from "../toast/Toast";
import { humanizeApiError } from "../../utils/apiErrors";

/**
 * EDITAR UN PAQUETE O UN MENÚ GUARDADO (12-10-2026): el lápiz de cada fila
 * de "Partir de un paquete" y de "Usar menú guardado". Cambia su nombre y
 * su grupo; lo que lleva adentro se arma al crearlo.
 */
export default function EditarGuardado({
  titulo,
  etiquetaNombre,
  nombre: nombreInicial,
  grupoId: grupoInicial,
  grupos,
  ayudaGrupos,
  onGuardar,
  onCerrar,
}: {
  readonly titulo: string;
  readonly etiquetaNombre: string;
  readonly nombre: string;
  readonly grupoId: number | null;
  readonly grupos: readonly { id: number; name: string }[];
  readonly ayudaGrupos: string;
  readonly onGuardar: (cambios: {
    nombre: string;
    grupoId: number | null;
  }) => Promise<void>;
  readonly onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [grupoId, setGrupoId] = useState(grupoInicial);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (!nombre.trim() || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await onGuardar({ nombre: nombre.trim(), grupoId });
      toast.success("Cambios guardados.");
      onCerrar();
    } catch (e) {
      setError(humanizeApiError(e, "No se pudieron guardar los cambios."));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo={titulo}
      ancho="max-w-md"
      onCerrar={onCerrar}
      pie={
        <>
          <button
            type="button"
            onClick={onCerrar}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void guardar()}
            disabled={guardando || !nombre.trim()}
            className="px-4 py-2 rounded-lg flex items-center space-x-2 bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-400 disabled:text-gray-600 disabled:cursor-not-allowed"
          >
            <Save size={16} />
            <span>{guardando ? "Guardando..." : "Guardar"}</span>
          </button>
        </>
      }
    >
      <label className="block text-sm font-medium text-gray-700 mb-1">
        {etiquetaNombre}
      </label>
      <input
        type="text"
        autoFocus
        value={nombre}
        maxLength={120}
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && void guardar()}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
      />
      <ElegirGrupo
        grupos={grupos}
        valor={grupoId}
        onCambio={setGrupoId}
        ayuda={ayudaGrupos}
      />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
