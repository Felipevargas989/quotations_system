import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import TarifarioDeBoletas from "../boletas/TarifarioDeBoletas";
import { LLAVE_HOY, useEmitidasHoy } from "../boletas/consultas";
import DocumentosDelMes from "./DocumentosDelMes";
import LetreroDelAmbiente from "./LetreroDelAmbiente";
import NuevoDocumento, { type TipoNuevo } from "./NuevoDocumento";

// LA SECCIÓN «FACTURACIÓN» (doc 19 §9.19 y §9.21). Una sola entrada del
// menú, justo debajo de Dashboard. Felipe, 06-11: arriba *"un botón de
// crear nuevo DTE que me pregunte si va a ser nota de crédito, débito,
// factura, boleta"*, y abajo el detalle. Salieron «Boleta suelta», «Por
// boletear» y «Emitidas hoy»; el tarifario se queda.
//
// Cada pieza sigue su interruptor de Mi empresa → Usuarios → Permisos por
// cargo (doc 22 §7): «Nuevo documento» ofrece la boleta con «Boletas» y
// las notas con «Anular o rebajar» (`facturacion_notas`); «Documentos» es
// `facturacion_documentos`, y el tarifario y «Probar la conexión»,
// `facturacion_ajustes`. Lo de fábrica: recepción, la boleta; operaciones,
// además «Documentos»; el administrador, todo.

type Pestana = "documentos" | "tarifario";

export default function FacturacionPage() {
  const queryClient = useQueryClient();
  const { permisos, userRole } = useAuth();
  const conDocumentos = permisos.includes("facturacion_documentos");
  const conAjustes = permisos.includes("facturacion_ajustes");
  const tipos: TipoNuevo[] = [
    ...(permisos.includes("boletas") ? (["boleta"] as const) : []),
    ...(permisos.includes("facturacion_notas")
      ? (["nota_credito", "nota_debito"] as const)
      : []),
  ];
  // Dónde se emite: lo trae el día de boletas, que lo lee todo el que
  // entra.
  const hoy = useEmitidasHoy();
  const pestanas: { key: Pestana; label: string }[] = [
    ...(conDocumentos
      ? [{ key: "documentos" as const, label: "Documentos" }]
      : []),
    ...(conAjustes ? [{ key: "tarifario" as const, label: "Tarifario" }] : []),
  ];
  const [elegida, setElegida] = useState<Pestana | null>(null);
  const pestana = elegida ?? pestanas[0]?.key ?? null;
  const [nuevo, setNuevo] = useState(false);

  const emitido = () => {
    void queryClient.invalidateQueries({ queryKey: ["facturacion", "lista"] });
    void queryClient.invalidateQueries({ queryKey: LLAVE_HOY });
  };

  return (
    // Abajo, espacio para que el botón de BelIA no tape las acciones de la
    // última fila.
    <div className="max-w-5xl space-y-4 p-4 pb-24 sm:p-6 sm:pb-24">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Facturación</h1>
        {tipos.length > 0 && !nuevo && (
          <button
            type="button"
            onClick={() => setNuevo(true)}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus size={15} /> Nuevo documento
          </button>
        )}
      </div>
      <LetreroDelAmbiente
        ambiente={hoy.data?.ambiente}
        sinConexion={hoy.data?.sin_conexion}
        que="Los documentos"
      />
      {nuevo && (
        <NuevoDocumento
          tipos={tipos}
          esAdmin={userRole === "administrador"}
          onCerrar={() => setNuevo(false)}
          onEmitido={emitido}
        />
      )}
      {pestanas.length > 0 && (
        <>
          <div className="flex flex-wrap gap-x-4 border-b border-gray-200">
            {pestanas.map((p) => (
              <button
                key={p.key}
                type="button"
                onClick={() => setElegida(p.key)}
                className={`-mb-px border-b-2 px-1 pb-2 text-sm font-medium ${pestana === p.key ? "border-blue-600 text-blue-600" : "border-transparent text-gray-600 hover:text-gray-900"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
          {pestana === "documentos" && (
            <DocumentosDelMes conAjustes={conAjustes} />
          )}
          {pestana === "tarifario" && <TarifarioDeBoletas />}
        </>
      )}
    </div>
  );
}
