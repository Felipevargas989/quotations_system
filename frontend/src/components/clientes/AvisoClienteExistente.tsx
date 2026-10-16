import { AlertTriangle } from "lucide-react";
import {
  CoincidenciaCliente,
  admiteOtroContacto,
  detalleDeCoincidencia,
  tituloDelAviso,
} from "../../utils/avisoCliente";

// El aviso ámbar que aparece DENTRO de la ventana "Crear nuevo cliente"
// cuando el motor encontró un cliente parecido (16-10-2026). Es la misma
// pieza en Recepción, el cotizador y Clientes: se arregla acá y las tres
// pantallas la reciben. No crea ni elige nada: avisa a quien la usa.
interface Props {
  coincidencias: CoincidenciaCliente[];
  ocupado: boolean;
  onUsar: (c: CoincidenciaCliente) => void;
  onSumarContacto: (c: CoincidenciaCliente) => void;
  onCrearIgual: () => void;
}

const botonClaro =
  "rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-50";

export default function AvisoClienteExistente({
  coincidencias,
  ocupado,
  onUsar,
  onSumarContacto,
  onCrearIgual,
}: Props) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900"
    >
      <div className="flex items-start gap-2">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
        <div className="flex-1 space-y-3">
          <p className="font-semibold">{tituloDelAviso(coincidencias)}</p>
          {coincidencias.map((c) => (
            <div key={c.cliente_id} className="space-y-2">
              <p>{detalleDeCoincidencia(c)}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => onUsar(c)}
                  className={botonClaro}
                >
                  Usar este cliente
                </button>
                {admiteOtroContacto(c) && (
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => onSumarContacto(c)}
                    className={botonClaro}
                  >
                    Sumar como contacto a este cliente
                  </button>
                )}
              </div>
            </div>
          ))}
          <button
            type="button"
            disabled={ocupado}
            onClick={onCrearIgual}
            className="text-sm font-medium text-amber-800 underline hover:text-amber-950 disabled:opacity-50"
          >
            Es otro cliente, crear igual
          </button>
        </div>
      </div>
    </div>
  );
}
