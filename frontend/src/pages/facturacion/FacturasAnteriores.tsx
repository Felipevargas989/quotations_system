import { useEffect, useState } from "react";
import { toast } from "../../components/toast/Toast";
import {
  getFacturasAnteriores,
  leerFacturasAnteriores,
  type LecturaDeFacturas,
} from "../../services/facturas.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { formatMomento } from "../../utils/dates";

// TUS FACTURAS ANTERIORES (doc 19 §9.29; Felipe, 08-11: *"¿qué pasó con
// buscar los datos solo con el RUT?"*). La segunda fuente del RUT que llena
// todo: las facturas que la empresa ya emitió en facturacion.cl, leídas una
// vez. «Leer mis facturas anteriores» las pide por detrás, de la más nueva
// a la más vieja; cada RUT queda con lo de su última factura. Junto a la
// nómina del SII: lo ve el administrador.

const miles = (n: number) => n.toLocaleString("es-CL");

export default function FacturasAnteriores() {
  const [ultima, setUltima] = useState<LecturaDeFacturas | null>(null);
  const [clientes, setClientes] = useState(0);
  const [sePuede, setSePuede] = useState(false);
  const [sinConexion, setSinConexion] = useState<string | null>(null);
  const [cargado, setCargado] = useState(false);
  const [pidiendo, setPidiendo] = useState(false);

  const mirar = async () => {
    try {
      const r = await getFacturasAnteriores();
      setUltima(r.ultima);
      setClientes(r.clientes);
      setSePuede(r.se_puede_leer);
      setSinConexion(r.sin_conexion);
    } catch {
      // Sin permiso o sin la tabla: no se muestra nada.
      return;
    } finally {
      setCargado(true);
    }
  };

  useEffect(() => {
    void mirar();
  }, []);

  // Mientras lee, se mira cada 5 segundos.
  const leyendo = ultima?.estado === "leyendo";
  useEffect(() => {
    if (!leyendo) return;
    const reloj = setInterval(() => void mirar(), 5000);
    return () => clearInterval(reloj);
  }, [leyendo]);

  const leer = async () => {
    setPidiendo(true);
    try {
      setUltima(await leerFacturasAnteriores());
    } catch (e) {
      toast.error(
        humanizeApiError(e, "No se pudieron leer las facturas anteriores."),
      );
    } finally {
      setPidiendo(false);
    }
  };

  if (!cargado) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-gray-600">
      <span className="font-semibold text-gray-700">
        Tus facturas anteriores:
      </span>
      {leyendo ? (
        <span className="text-violet-700">
          leyendo… {miles(ultima?.leidas ?? 0)} de {miles(ultima?.folios ?? 0)}
        </span>
      ) : ultima?.estado === "lista" ? (
        <span>
          {miles(clientes)} {clientes === 1 ? "cliente" : "clientes"} de{" "}
          {miles(ultima.encontradas)}{" "}
          {ultima.encontradas === 1 ? "factura" : "facturas"} · leídas el{" "}
          {formatMomento(ultima.termino_en ?? ultima.empezo_en, "diaMes")}
        </span>
      ) : (
        <span>sin leer</span>
      )}
      {ultima?.estado === "fallo" && (
        <span className="text-red-700">
          La última lectura se cortó: {ultima.error ?? "sin motivo"}.
        </span>
      )}
      {!sePuede && sinConexion && (
        <span className="text-gray-500">{sinConexion}.</span>
      )}
      {!leyendo && sePuede && (
        <button
          type="button"
          disabled={pidiendo}
          onClick={() => void leer()}
          className="rounded-lg border border-gray-300 bg-white px-2.5 py-1 font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {ultima?.estado === "lista"
            ? "Leer de nuevo"
            : "Leer mis facturas anteriores"}
        </button>
      )}
    </div>
  );
}
