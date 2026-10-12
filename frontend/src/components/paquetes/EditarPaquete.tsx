import { useState } from "react";
import { Save } from "lucide-react";
import Modal from "../Modal";
import ElegirGrupoDePaquete from "./ElegirGrupoDePaquete";
import { toast } from "../toast/Toast";
import { humanizeApiError } from "../../utils/apiErrors";
import {
  CambiosDePaquete,
  ServiceGroupCollection,
} from "../../types/serviceGroupCollections.types";

/**
 * EDITAR UN PAQUETE YA CREADO (12-10-2026): el lápiz de cada fila de
 * "Partir de un paquete". Cambia su nombre y su grupo; lo que lleva
 * adentro (menús, sueltos y fijos) se arma al crearlo.
 */
export default function EditarPaquete({
  paquete,
  onGuardar,
  onCerrar,
}: {
  readonly paquete: ServiceGroupCollection;
  readonly onGuardar: (cambios: CambiosDePaquete) => Promise<void>;
  readonly onCerrar: () => void;
}) {
  const [nombre, setNombre] = useState(paquete.name);
  const [grupoId, setGrupoId] = useState(paquete.package_group_id ?? null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const guardar = async () => {
    if (!nombre.trim() || guardando) return;
    setGuardando(true);
    setError(null);
    try {
      await onGuardar({ name: nombre.trim(), package_group_id: grupoId });
      toast.success("Paquete guardado.");
      onCerrar();
    } catch (e) {
      setError(humanizeApiError(e, "No se pudo guardar el paquete."));
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      titulo="Editar paquete"
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
            onClick={guardar}
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
        Nombre del paquete
      </label>
      <input
        type="text"
        autoFocus
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && guardar()}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-4"
      />
      <ElegirGrupoDePaquete valor={grupoId} onCambio={setGrupoId} />
      {error && <p className="text-sm text-red-600">{error}</p>}
    </Modal>
  );
}
