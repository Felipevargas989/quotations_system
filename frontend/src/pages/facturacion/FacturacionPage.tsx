import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import type { DocumentoDeLaLista } from "../../services/documentosTributarios.service";
import { getSolicitudes } from "../../services/solicitudes.service";
import TarifarioDeBoletas from "../boletas/TarifarioDeBoletas";
import { LLAVE_HOY, useEmitidasHoy } from "../boletas/consultas";
import BoletaNueva from "./BoletaNueva";
import CajaDeRecepcion from "./CajaDeRecepcion";
import CierresDeCaja from "./CierresDeCaja";
import LoVendido from "./LoVendido";
import { usePorFacturar } from "./consultas";
import FacturaNueva from "./FacturaNueva";
import LetreroDelAmbiente from "./LetreroDelAmbiente";
import ListaDeDocumentos from "./ListaDeDocumentos";
import { filtrosDeHoy, type Filtros } from "./filtrosDeLaLista";
import NotaNueva from "./NotaNueva";
import NuevoDocumento from "./NuevoDocumento";
import type { TipoNuevo } from "./tiposDeDocumento";
import PorFacturar from "./PorFacturar";
import SolicitudesPorAprobar from "./SolicitudesPorAprobar";
import { LLAVE_SOLICITUDES } from "./solicitudes";

// LA SECCIÓN «FACTURACIÓN» (doc 19 §9.19 y §9.21). Una sola entrada del
// menú, justo debajo de Dashboard. Felipe, 06-11: arriba *"un botón de
// crear nuevo DTE que me pregunte si va a ser nota de crédito, débito,
// factura, boleta"*, y abajo el detalle. Salieron «Boleta suelta», «Por
// boletear» y «Emitidas hoy»; el tarifario se queda. «Por facturar»: los
// eventos con algo por emitir, para facturarlos desde acá.
//
// §9.22 (la maqueta que aprobó Felipe el 06-11): «Nuevo documento» abre una
// ventana para elegir qué se emite, y cada documento se arma en su propia
// pantalla, con la misma cabecera, las mismas secciones y la misma vista
// previa: la factura (sprint 1), y la boleta y las notas (sprint 3).
// «← Documentos» vuelve a la lista, y lo recién emitido queda marcado.
// Desde la lista, «Anular o rebajar…» abre la nota con su documento ya
// elegido.
//
// Cada pieza sigue su interruptor de Mi empresa → Usuarios → Permisos por
// cargo (doc 22 §7). Desde el 07-11 todo se factura acá (doc 19 §9.23;
// Felipe: *"se debería facturar todo desde el módulo de facturación"*):
// - «Nuevo documento» ofrece la boleta y la factura con «Boletas y facturas
//   del tarifario» (`boletas`): las líneas, del tarifario; a mano y con
//   descuento, solo el administrador. Las notas, con «Anular o rebajar»
//   (`facturacion_notas`).
// - «Por facturar» es de «Facturar eventos» (`facturacion_eventos`), que
//   también los emite; «Documentos», de `facturacion_documentos`, y el
//   tarifario y «Probar la conexión», de `facturacion_ajustes`.
// Lo de fábrica: recepción, la boleta y la factura del tarifario;
// operaciones, además los eventos y «Documentos»; el administrador, todo.
//
// §9.45 (Felipe, 09-11): recepción ya no emite al SII. Su boleta y su
// factura al contado salen como «Enviar solicitud», y la pestaña
// «Solicitudes» (permiso «Aprobar y emitir solicitudes», de fábrica
// operaciones y el administrador) las aprueba y emite, o las rechaza.

type Pestana =
  | "documentos"
  | "solicitudes"
  | "por_facturar"
  | "tarifario"
  | "caja"
  | "vendido";

/** El documento que se está armando, y el que la nota modifica si llegó
 *  desde la lista. */
interface Abierto {
  tipo: TipoNuevo;
  doc?: DocumentoDeLaLista;
}

export default function FacturacionPage() {
  const queryClient = useQueryClient();
  const { permisos, userRole, userName } = useAuth();
  const conDocumentos = permisos.includes("facturacion_documentos");
  const conEventos = permisos.includes("facturacion_eventos");
  const conAjustes = permisos.includes("facturacion_ajustes");
  // §9.43: la caja de recepción (operarla) y sus cierres (revisarlos).
  const conCaja = permisos.includes("caja_recepcion");
  const conCierres = permisos.includes("caja_revision");
  // «Lo vendido», su propia pestaña (Felipe, 09-11: «solo lo vea
  // operaciones y administración»).
  const conVendido = permisos.includes("facturacion_vendido");
  // §9.45: aprobar y emitir lo que pide recepción.
  const conSolicitudes = permisos.includes("facturacion_solicitudes");
  // Recepción manda solicitudes en vez de emitir.
  const solicita = userRole === "recepcion";
  const solicitudes = useQuery({
    queryKey: LLAVE_SOLICITUDES,
    queryFn: getSolicitudes,
    enabled: conSolicitudes,
    refetchInterval: 60_000,
  });
  const esperan = solicitudes.data?.pendientes;
  const tipos: TipoNuevo[] = [
    ...(permisos.includes("boletas") ? (["factura", "boleta"] as const) : []),
    ...(permisos.includes("facturacion_notas")
      ? (["nota_credito", "nota_debito"] as const)
      : []),
  ];
  // Dónde se emite: lo trae el día de boletas, que lo lee todo el que
  // entra.
  const hoy = useEmitidasHoy();
  const porFacturar = usePorFacturar(conEventos);
  const pendientes = porFacturar.data?.eventos.length;
  const pestanas: { key: Pestana; label: string }[] = [
    ...(conDocumentos
      ? [{ key: "documentos" as const, label: "Documentos" }]
      : []),
    ...(conSolicitudes
      ? [
          {
            key: "solicitudes" as const,
            label: esperan ? `Solicitudes (${esperan})` : "Solicitudes",
          },
        ]
      : []),
    ...(conEventos
      ? [
          {
            key: "por_facturar" as const,
            label:
              pendientes == null
                ? "Por facturar"
                : `Por facturar (${pendientes})`,
          },
        ]
      : []),
    ...(conCaja || conCierres ? [{ key: "caja" as const, label: "Caja" }] : []),
    ...(conVendido ? [{ key: "vendido" as const, label: "Lo vendido" }] : []),
    ...(conAjustes ? [{ key: "tarifario" as const, label: "Tarifario" }] : []),
  ];
  const [elegida, setElegida] = useState<Pestana | null>(null);
  const pestana = elegida ?? pestanas[0]?.key ?? null;
  // La ventana que pregunta qué se emite, y la pantalla del que se eligió.
  const [eligiendo, setEligiendo] = useState(false);
  const [abierto, setAbierto] = useState<Abierto | null>(null);
  // El que se acaba de emitir: la lista lo marca (§9.22).
  const [recien, setRecien] = useState<number | null>(null);
  // Las fechas y los filtros de la lista quedan al ir a anular y volver
  // (Felipe, 08-11: «el sistema me borra los filtros de fecha»).
  const [filtros, setFiltros] = useState<Filtros>(filtrosDeHoy);
  const esAdmin = userRole === "administrador";
  const nuevoDocumento = () =>
    tipos.length === 1 ? setAbierto({ tipo: tipos[0] }) : setEligiendo(true);

  const refrescar = () => {
    void queryClient.invalidateQueries({ queryKey: ["facturacion", "lista"] });
    void queryClient.invalidateQueries({
      queryKey: ["facturacion", "por-facturar"],
    });
    void queryClient.invalidateQueries({ queryKey: LLAVE_HOY });
  };
  // Emitido: de vuelta a la lista, con lo nuevo marcado.
  const emitido = (id: number | null) => {
    refrescar();
    setRecien(id);
    if (conDocumentos) setElegida("documentos");
    setAbierto(null);
  };

  const letrero = (
    <LetreroDelAmbiente
      ambiente={hoy.data?.ambiente}
      sinConexion={hoy.data?.sin_conexion}
      que="Los documentos"
    />
  );

  // El documento en su propia pantalla (§9.22), a todo el ancho, como la
  // lista (Felipe, 08-11: *"acá deberíamos aprovechar el ancho también"*).
  if (abierto)
    return (
      <div className="space-y-4 p-4 pb-24 sm:p-6 sm:pb-24">
        {letrero}
        {abierto.tipo === "factura" ? (
          <FacturaNueva
            esAdmin={esAdmin}
            // §9.45 y §9.46: recepción manda la solicitud, siempre.
            solicita={solicita}
            // Sin la lista a la vista (recepción), se queda para la próxima.
            quedarse={!conDocumentos}
            onVolver={() => setAbierto(null)}
            onEmitida={(doc) => (conDocumentos ? emitido(doc.id) : refrescar())}
          />
        ) : abierto.tipo === "boleta" ? (
          <BoletaNueva
            esAdmin={esAdmin}
            // §9.43: recepción emite con la caja abierta.
            conCaja={userRole === "recepcion"}
            // §9.45: recepción manda la solicitud.
            solicita={solicita}
            // Sin la lista a la vista (recepción), se queda para la próxima.
            quedarse={!conDocumentos}
            onVolver={() => setAbierto(null)}
            onEmitida={(boleta) =>
              conDocumentos ? emitido(boleta?.id ?? null) : refrescar()
            }
          />
        ) : (
          <NotaNueva
            key={`${abierto.tipo}-${abierto.doc?.id ?? "nueva"}`}
            tipo={abierto.tipo}
            inicial={abierto.doc ?? null}
            onVolver={() => setAbierto(null)}
            onEmitida={(nota) => emitido(nota.id)}
          />
        )}
      </div>
    );

  return (
    // A todo el ancho de la pantalla (Felipe, 07-11: *"si ocupas el ancho
    // completo de la pantalla podrías tener más espacio"*); el documento que
    // se arma sigue con su ancho de formulario. Abajo, espacio para que el
    // botón de BelIA no tape las acciones de la última fila.
    <div className="space-y-4 p-4 pb-24 sm:p-6 sm:pb-24">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-gray-900">Facturación</h1>
        {/* En «Por facturar» el botón de arriba es «Facturar seleccionados»
            (§9.31; Felipe, 08-11: *"el botón ya no debería ser + nuevo
            documento"*), que vive con la lista. */}
        {tipos.length > 0 && pestana !== "por_facturar" && (
          <button
            type="button"
            onClick={nuevoDocumento}
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
          >
            <Plus size={15} /> Nuevo DTE
          </button>
        )}
      </div>
      {letrero}
      {eligiendo && (
        <NuevoDocumento
          tipos={tipos}
          onElegir={(t) => {
            setEligiendo(false);
            setAbierto({ tipo: t });
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
            <ListaDeDocumentos
              conAjustes={conAjustes}
              recien={recien}
              filtros={filtros}
              onFiltros={setFiltros}
              onModificar={(doc) =>
                setAbierto({
                  tipo: doc.tipo === 61 ? "nota_debito" : "nota_credito",
                  doc,
                })
              }
            />
          )}
          {pestana === "solicitudes" && <SolicitudesPorAprobar />}
          {pestana === "por_facturar" && <PorFacturar />}
          {pestana === "caja" && (
            <div className="space-y-6">
              {conCaja && <CajaDeRecepcion nombre={userName} />}
              {conCierres && <CierresDeCaja />}
            </div>
          )}
          {pestana === "vendido" && <LoVendido />}
          {pestana === "tarifario" && <TarifarioDeBoletas />}
        </>
      )}
    </div>
  );
}
