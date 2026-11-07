import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import BoletaSuelta from "../boletas/BoletaSuelta";
import TarifarioDeBoletas from "../boletas/TarifarioDeBoletas";
import { LLAVE_HOY, useEmitidasHoy } from "../boletas/consultas";
import { usePorFacturar } from "./consultas";
import ElegirDocumento from "./ElegirDocumento";
import FacturaNueva from "./FacturaNueva";
import LetreroDelAmbiente from "./LetreroDelAmbiente";
import ListaDeDocumentos from "./ListaDeDocumentos";
import NuevoDocumento from "./NuevoDocumento";
import { NOMBRE_DEL_NUEVO, type TipoNuevo } from "./tiposDeDocumento";
import PorFacturar from "./PorFacturar";

// LA SECCIÓN «FACTURACIÓN» (doc 19 §9.19 y §9.21). Una sola entrada del
// menú, justo debajo de Dashboard. Felipe, 06-11: arriba *"un botón de
// crear nuevo DTE que me pregunte si va a ser nota de crédito, débito,
// factura, boleta"*, y abajo el detalle. Salieron «Boleta suelta», «Por
// boletear» y «Emitidas hoy»; el tarifario se queda. «Por facturar»: los
// eventos con algo por emitir, para facturarlos desde acá.
//
// §9.22 (la maqueta que aprobó Felipe el 06-11): «Nuevo documento» abre una
// ventana para elegir qué se emite, y el documento se arma en su propia
// pantalla; «← Documentos» vuelve a la lista.
//
// Cada pieza sigue su interruptor de Mi empresa → Usuarios → Permisos por
// cargo (doc 22 §7): «Nuevo documento» ofrece la factura al administrador
// con «Documentos» (D5), la boleta con «Boletas» y las notas con «Anular o
// rebajar» (`facturacion_notas`); «Documentos» y
// «Por facturar» son `facturacion_documentos`, y el tarifario y «Probar la
// conexión»,
// `facturacion_ajustes`. Lo de fábrica: recepción, la boleta; operaciones,
// además «Documentos»; el administrador, todo.

type Pestana = "documentos" | "por_facturar" | "tarifario";

export default function FacturacionPage() {
  const queryClient = useQueryClient();
  const { permisos, userRole } = useAuth();
  const conDocumentos = permisos.includes("facturacion_documentos");
  const conAjustes = permisos.includes("facturacion_ajustes");
  // La factura de cero la emite el administrador (D5), con «Documentos».
  const tipos: TipoNuevo[] = [
    ...(userRole === "administrador" && conDocumentos
      ? (["factura"] as const)
      : []),
    ...(permisos.includes("boletas") ? (["boleta"] as const) : []),
    ...(permisos.includes("facturacion_notas")
      ? (["nota_credito", "nota_debito"] as const)
      : []),
  ];
  // Dónde se emite: lo trae el día de boletas, que lo lee todo el que
  // entra.
  const hoy = useEmitidasHoy();
  const porFacturar = usePorFacturar(conDocumentos);
  const pendientes = porFacturar.data?.eventos.length;
  const pestanas: { key: Pestana; label: string }[] = [
    ...(conDocumentos
      ? [
          { key: "documentos" as const, label: "Documentos" },
          {
            key: "por_facturar" as const,
            label:
              pendientes == null
                ? "Por facturar"
                : `Por facturar (${pendientes})`,
          },
        ]
      : []),
    ...(conAjustes ? [{ key: "tarifario" as const, label: "Tarifario" }] : []),
  ];
  const [elegida, setElegida] = useState<Pestana | null>(null);
  const pestana = elegida ?? pestanas[0]?.key ?? null;
  // La ventana que pregunta qué se emite, y la pantalla del que se eligió.
  const [eligiendo, setEligiendo] = useState(false);
  const [abierto, setAbierto] = useState<TipoNuevo | null>(null);
  // El que se acaba de emitir: la lista lo marca (§9.22).
  const [recien, setRecien] = useState<number | null>(null);
  const esAdmin = userRole === "administrador";
  const nuevoDocumento = () =>
    tipos.length === 1 ? setAbierto(tipos[0]) : setEligiendo(true);

  const emitido = () => {
    void queryClient.invalidateQueries({ queryKey: ["facturacion", "lista"] });
    void queryClient.invalidateQueries({
      queryKey: ["facturacion", "por-facturar"],
    });
    void queryClient.invalidateQueries({ queryKey: LLAVE_HOY });
  };

  const letrero = (
    <LetreroDelAmbiente
      ambiente={hoy.data?.ambiente}
      sinConexion={hoy.data?.sin_conexion}
      que="Los documentos"
    />
  );

  // El documento en su propia pantalla (§9.22).
  if (abierto)
    return (
      <div className="max-w-5xl space-y-4 p-4 pb-24 sm:p-6 sm:pb-24">
        {letrero}
        {abierto === "factura" ? (
          <FacturaNueva
            puedeEmitir={esAdmin}
            onVolver={() => setAbierto(null)}
            onEmitida={(doc) => {
              emitido();
              setRecien(doc.id);
              if (conDocumentos) setElegida("documentos");
              setAbierto(null);
            }}
          />
        ) : (
          <PantallaDelDocumento
            titulo={`Nueva ${NOMBRE_DEL_NUEVO[abierto].toLowerCase()}`}
            onVolver={() => setAbierto(null)}
          >
            {abierto === "boleta" ? (
              <BoletaSuelta esAdmin={esAdmin} onEmitida={emitido} />
            ) : (
              <ElegirDocumento
                key={abierto}
                tipo={abierto}
                onEmitida={emitido}
              />
            )}
          </PantallaDelDocumento>
        )}
      </div>
    );

  return (
    // Abajo, espacio para que el botón de BelIA no tape las acciones de la
    // última fila.
    <div className="max-w-5xl space-y-4 p-4 pb-24 sm:p-6 sm:pb-24">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Facturación</h1>
        {tipos.length > 0 && (
          <button
            type="button"
            onClick={nuevoDocumento}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus size={15} /> Nuevo documento
          </button>
        )}
      </div>
      {letrero}
      {eligiendo && (
        <NuevoDocumento
          tipos={tipos}
          onElegir={(t) => {
            setEligiendo(false);
            setAbierto(t);
          }}
          onCerrar={() => setEligiendo(false)}
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
            <ListaDeDocumentos conAjustes={conAjustes} recien={recien} />
          )}
          {pestana === "por_facturar" && (
            <PorFacturar puedeEmitir={userRole === "administrador"} />
          )}
          {pestana === "tarifario" && <TarifarioDeBoletas />}
        </>
      )}
    </div>
  );
}

/** La boleta y las notas en su pantalla, con «← Documentos» (§9.22). */
function PantallaDelDocumento({
  titulo,
  onVolver,
  children,
}: {
  readonly titulo: string;
  readonly onVolver: () => void;
  readonly children: ReactNode;
}) {
  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onVolver}
        className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline"
      >
        <ArrowLeft size={15} /> Documentos
      </button>
      <h1 className="text-xl font-semibold text-gray-900">{titulo}</h1>
      {children}
    </div>
  );
}
