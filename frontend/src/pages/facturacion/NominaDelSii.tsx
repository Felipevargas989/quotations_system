import { useEffect, useState } from "react";
import { toast } from "../../components/toast/Toast";
import {
  cargarNominaSii,
  getNominaSii,
  type CargaDeLaNomina,
} from "../../services/facturas.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";

// LA NÓMINA DEL SII (doc 19 §9.27; Felipe, 07-11: *"¿cómo lo podemos hacer
// para que al momento de facturar, el sistema cargue todo solo con el
// RUT?"*). Cuántas empresas tiene y cuándo se cargó; «Cargar la nómina del
// SII» la baja de sii.cl por detrás (el SII la pone al día una vez al año,
// en agosto). Junto a «Probar la conexión»: lo ve el administrador.

const miles = (n: number) => n.toLocaleString("es-CL");

export default function NominaDelSii() {
  const [ultima, setUltima] = useState<CargaDeLaNomina | null>(null);
  const [lista, setLista] = useState<CargaDeLaNomina | null>(null);
  const [cargado, setCargado] = useState(false);
  const [pidiendo, setPidiendo] = useState(false);

  const mirar = async () => {
    try {
      const r = await getNominaSii();
      setUltima(r.ultima);
      setLista(r.lista);
    } catch {
      // Sin permiso o sin la tabla: no se muestra nada.
    } finally {
      setCargado(true);
    }
  };

  useEffect(() => {
    void mirar();
  }, []);

  // Mientras carga, se mira cada 5 segundos.
  const cargando = ultima?.estado === "cargando";
  useEffect(() => {
    if (!cargando) return;
    const reloj = setInterval(() => void mirar(), 5000);
    return () => clearInterval(reloj);
  }, [cargando]);

  const cargar = async () => {
    setPidiendo(true);
    try {
      setUltima(await cargarNominaSii());
    } catch (e) {
      toast.error(humanizeApiError(e, "No se pudo cargar la nómina del SII."));
    } finally {
      setPidiendo(false);
    }
  };

  if (!cargado) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
      <span className="font-semibold text-gray-700">Nómina del SII:</span>
      {cargando ? (
        <span className="text-violet-700">
          cargando…{" "}
          {ultima?.empresas ? `${miles(ultima.empresas)} empresas` : ""}
        </span>
      ) : lista ? (
        <span>
          {miles(lista.empresas)} empresas · cargada el{" "}
          {formatMomento(lista.termino_en ?? lista.empezo_en, "diaMes")}
        </span>
      ) : (
        <span>sin cargar</span>
      )}
      {ultima?.estado === "fallo" && (
        <span className="text-red-700">
          La última carga falló: {ultima.error ?? "sin motivo"}.
        </span>
      )}
      {!cargando && (
        <button
          type="button"
          disabled={pidiendo}
          onClick={() => void cargar()}
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {lista ? "Cargar de nuevo" : "Cargar la nómina del SII"}
        </button>
      )}
    </div>
  );
}
