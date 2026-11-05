import { useState } from "react";
import { toast } from "../../components/toast/Toast";
import {
  probarConexionConFacturacionCl,
  type ConexionConFacturacionCl,
} from "../../services/documentosTributarios.service";
import { humanizeApiError } from "../../utils/apiErrors";

// «PROBAR LA CONEXIÓN» (doc 19 §9.18, el paso 0): si facturacion.cl
// responde desde el motor, en cuánto, y, conectado, los folios que quedan de
// cada tipo (`ConsultarCAF`). No emite nada.

const NOMBRE: Record<number, string> = {
  33: "Facturas",
  61: "Notas de crédito",
  56: "Notas de débito",
  39: "Boletas",
};

const segundos = (ms: number) =>
  `${(ms / 1000).toLocaleString("es-CL", { maximumFractionDigits: 1 })} s`;

export default function ProbarLaConexion() {
  const [resultado, setResultado] = useState<ConexionConFacturacionCl | null>(
    null,
  );
  const [probando, setProbando] = useState(false);

  const probar = async () => {
    setProbando(true);
    try {
      setResultado(await probarConexionConFacturacionCl());
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo probar la conexión."));
    } finally {
      setProbando(false);
    }
  };

  const s = resultado?.servicio;
  return (
    <div className="space-y-1">
      <button
        type="button"
        disabled={probando}
        onClick={() => void probar()}
        className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 text-xs rounded-lg font-semibold hover:bg-gray-50 disabled:opacity-50"
      >
        {probando ? "Probando…" : "Probar la conexión"}
      </button>
      {resultado && s && (
        <div className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 space-y-0.5">
          <p className={s.en_linea ? "text-green-700" : "text-red-700"}>
            {s.en_linea
              ? `facturacion.cl responde en ${segundos(s.ms)}${s.version ? ` (versión ${s.version})` : ""}.`
              : `facturacion.cl no responde: ${s.error ?? "sin respuesta"}.`}
          </p>
          {resultado.ambiente === "simulado" && (
            <p className="text-gray-500">
              Sin credenciales, el simulado no tiene folios que mostrar.
            </p>
          )}
          {resultado.folios.map((f) => (
            <p key={f.tipo}>
              {NOMBRE[f.tipo] ?? `Tipo ${f.tipo}`}:{" "}
              {f.error ? (
                <span className="text-red-700">{f.error}</span>
              ) : (
                `quedan ${f.libres?.toLocaleString("es-CL")} folios, sigue el N° ${f.siguiente}${f.vence ? `, el rango vence el ${f.vence}` : ""}`
              )}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
