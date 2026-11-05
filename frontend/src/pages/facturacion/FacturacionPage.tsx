import { useState } from "react";
import { useAuth } from "../../contexts/AuthContext";
import Boletas, { type PestanaDeBoletas } from "../boletas/Boletas";
import { useEmitidasHoy, usePorBoletear } from "../boletas/consultas";
import DocumentosDelMes from "./DocumentosDelMes";
import LetreroDelAmbiente from "./LetreroDelAmbiente";

// LA SECCIÓN «FACTURACIÓN» (doc 19 §9.19, 05-11): una sola entrada del menú
// para las boletas y los documentos. Felipe: *"creo que es demasiado poner
// dos"*. Cada cargo ve sus pestañas:
// - recepción (y el vendedor, como hasta hoy): las boletas;
// - operaciones: además «Documentos», para mirar, bajar el reporte y pedir
//   el PDF;
// - el administrador: todo, con el tarifario y las notas (E5).
// Solo con el módulo propio `facturacion`. Desde los permisos por cargo
// (doc 22 §7, 05-11-2026) cada pestaña es un interruptor de Mi empresa →
// Usuarios → Permisos por cargo: «Documentos» es `facturacion_documentos`
// y el tarifario y «Probar la conexión», `facturacion_ajustes`. Lo de
// fábrica es lo de arriba.

type Pestana = "documentos" | PestanaDeBoletas;

export default function FacturacionPage() {
  const { permisos } = useAuth();
  const conDocumentos = permisos.includes("facturacion_documentos");
  const conAjustes = permisos.includes("facturacion_ajustes");
  const porBoletear = usePorBoletear();
  const hoy = useEmitidasHoy();
  const cobros = porBoletear.data?.cobros.length ?? 0;
  // Operaciones y el administrador parten en «Documentos». Los demás, en
  // «Por boletear» si hay algo que boletear (la maqueta de las boletas), y
  // si no, en la boleta suelta. Lo que elija la persona manda después.
  const [elegida, setElegida] = useState<Pestana | null>(null);
  const pestana: Pestana =
    elegida ??
    (conDocumentos ? "documentos" : cobros > 0 ? "por_boletear" : "suelta");

  const boletas = hoy.data?.boletas.length ?? 0;
  const donde = porBoletear.data ?? hoy.data;
  const pestanas: { key: Pestana; label: string }[] = [
    ...(conDocumentos
      ? [{ key: "documentos" as const, label: "Documentos" }]
      : []),
    { key: "suelta", label: "Boleta suelta" },
    { key: "por_boletear", label: `Por boletear (${cobros})` },
    { key: "hoy", label: `Emitidas hoy (${boletas})` },
    ...(conAjustes ? [{ key: "tarifario" as const, label: "Tarifario" }] : []),
  ];

  return (
    // Abajo, espacio para que el botón de BelIA no tape las acciones de la
    // última fila.
    <div className="max-w-5xl space-y-4 p-4 pb-24 sm:p-6 sm:pb-24">
      <h1 className="text-xl font-semibold text-gray-900">Facturación</h1>
      <LetreroDelAmbiente
        ambiente={donde?.ambiente}
        sinConexion={donde?.sin_conexion}
        que={conDocumentos ? "Los documentos" : "Las boletas"}
      />
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
      {pestana === "documentos" ? (
        <DocumentosDelMes conAjustes={conAjustes} />
      ) : (
        <Boletas pestana={pestana} />
      )}
    </div>
  );
}
