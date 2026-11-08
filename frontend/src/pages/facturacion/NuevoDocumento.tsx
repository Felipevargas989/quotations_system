import { CirclePlus, CircleMinus, FileText, Receipt } from "lucide-react";
import Modal from "../../components/Modal";
import { NOMBRE_DEL_NUEVO, type TipoNuevo } from "./tiposDeDocumento";

// «NUEVO DOCUMENTO» (doc 19 §9.21 y §9.22): la ventana que pregunta qué se
// emite, como la maqueta que aprobó Felipe el 06-11. Cada uno ve solo lo
// que puede emitir (lo decide la sección); con una sola opción, la sección
// va directo a ella y esta ventana no se abre.

const ICONO: Record<TipoNuevo, typeof FileText> = {
  factura: FileText,
  boleta: Receipt,
  nota_credito: CircleMinus,
  nota_debito: CirclePlus,
};

export default function NuevoDocumento({
  tipos,
  onElegir,
  onCerrar,
}: {
  readonly tipos: TipoNuevo[];
  readonly onElegir: (tipo: TipoNuevo) => void;
  readonly onCerrar: () => void;
}) {
  return (
    <Modal titulo="Nuevo DTE" ancho="max-w-md" onCerrar={onCerrar}>
      <div className="grid gap-2">
        {tipos.map((t) => {
          const Icono = ICONO[t];
          return (
            <button
              key={t}
              type="button"
              onClick={() => onElegir(t)}
              className="flex items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 py-3 text-left text-sm font-semibold text-gray-900 hover:border-blue-500 hover:bg-blue-50"
            >
              <Icono size={18} className="shrink-0 text-blue-600" />
              {NOMBRE_DEL_NUEVO[t]}
            </button>
          );
        })}
      </div>
    </Modal>
  );
}
