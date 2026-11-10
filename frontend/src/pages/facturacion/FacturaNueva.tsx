import { useState } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import FileViewLink from "../../components/FileViewLink";
import Modal from "../../components/Modal";
import { toast } from "../../components/toast/Toast";
import { marcaDelAmbiente } from "../../constants/facturacion";
import { getTarifario } from "../../services/boletas.service";
import {
  emitirFacturaSinEvento,
  getClientesParaFacturar,
  revisarFacturaSinEvento,
  type DocumentoTributario,
  type DtePedido,
} from "../../services/facturas.service";
import { solicitarFactura } from "../../services/solicitudes.service";
import { humanizeApiError } from "../../utils/apiErrors";
import LineasDelDte, {
  TotalesDelDte,
} from "../postventa/facturacion/LineasDelDte";
import ReferenciasDelDte from "../postventa/facturacion/ReferenciasDelDte";
import VistaPreviaDelDte from "../postventa/facturacion/VistaPreviaDelDte";
import {
  RECEPTOR_VACIO,
  lineaAMano,
  lineaDelTarifario,
  useQuieto,
} from "../postventa/facturacion/datosDeLaFactura";
import DestinatarioDeLaFactura from "./DestinatarioDeLaFactura";
import { CabeceraDelDocumento, Seccion } from "./PiezasDelDocumento";
import SeccionDocumento from "./SeccionDocumento";
import SolicitudesDelTurno from "./SolicitudesDelTurno";
import { LLAVE_DEL_TURNO, clp } from "./solicitudes";

// LA FACTURA DE «NUEVO DOCUMENTO» (doc 19 §9.22), como la maqueta que
// aprobó Felipe el 06-11 (*"está perfecto (…) me gusta toda la
// usabilidad"*): su propia pantalla, con el Documento (la fecha y la
// condición de pago, crédito a 30 días si no se dice), el Destinatario
// (buscado en Clientes o creado nuevo), los Ítems, las Referencias y los
// Totales. «Crear documento» muestra la factura tal como saldrá, y ahí se
// emite. La revisión es la del motor: la misma que emite.
//
// Desde el 08-11 (§9.32), el Documento es la pieza común con «Corregir»
// de la revisión (`SeccionDocumento`): la fecha de emisión se elige dentro
// de lo que deja el motor, y la condición de pago va en una lista.
//
// Desde el 07-11 (§9.23) la emite quien tiene «Boletas y facturas del
// tarifario» (recepción, operaciones y el administrador): las líneas, del
// tarifario, por su cantidad. La línea a mano y el descuento, solo el
// administrador (D3: los precios nunca a dedo). Quien no ve la lista
// (recepción) se queda en la factura después de emitir, con la última a la
// vista, como en la boleta.
//
// §9.45 (Felipe, 09-11): la factura de recepción no se emite: «Enviar
// solicitud» la guarda y la emite quien tiene «Aprobar y emitir
// solicitudes». §9.46 (10-11): un solo proceso, sea cual sea su condición
// de pago, y siempre con el medio con que se cobró (la venta entra a la
// caja del turno, se emita o no).

const LLAVE_CLIENTES = ["facturacion", "clientes"];

const inicial = (esAdmin: boolean): DtePedido => ({
  tipo: 33,
  orden_de_compra_id: null,
  receptor: RECEPTOR_VACIO,
  lineas: [esAdmin ? lineaAMano() : lineaDelTarifario()],
  referencias: [],
  pedir_siempre: [],
  forma_de_pago: 2,
  plazo_dias: 30,
  cliente_id: null,
});

/** Lo que va al motor: sin las líneas del tarifario que aún no se eligen. */
const elegidas = (p: DtePedido): DtePedido => ({
  ...p,
  lineas: p.lineas.filter((l) => l.tarifario_id !== null),
});

export default function FacturaNueva({
  esAdmin,
  solicita = false,
  quedarse,
  onVolver,
  onEmitida,
}: {
  /** La línea a mano y el descuento (§9.23). */
  readonly esAdmin: boolean;
  /** §9.45 y §9.46: recepción manda su factura como solicitud, siempre. */
  readonly solicita?: boolean;
  /** Sin la lista a la vista: después de emitir, otra factura. */
  readonly quedarse: boolean;
  readonly onVolver: () => void;
  readonly onEmitida: (doc: DocumentoTributario) => void;
}) {
  const queryClient = useQueryClient();
  const [pedida, setPedida] = useState<DtePedido>(() => inicial(esAdmin));
  const [viendo, setViendo] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const [ultima, setUltima] = useState<DocumentoTributario | null>(null);
  const poner = (cambios: Partial<DtePedido>) =>
    setPedida((p) => ({ ...p, ...cambios }));

  const clientes = useQuery({
    queryKey: LLAVE_CLIENTES,
    queryFn: getClientesParaFacturar,
    staleTime: 60_000,
  });
  const tarifario = useQuery({
    queryKey: ["boletas", "tarifario"],
    queryFn: getTarifario,
  });
  const sinTarifario =
    !esAdmin &&
    !tarifario.isPending &&
    !(tarifario.data ?? []).some((t) => t.activo);
  // La vista previa se pide cuando se deja de escribir, no en cada tecla.
  const quieta = useQuieto(pedida);
  const revision = useQuery({
    queryKey: ["facturacion", "revisar", "nuevo-documento", quieta],
    queryFn: () => revisarFacturaSinEvento(elegidas(quieta)),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  const vista = revision.data;
  const revisando = pedida !== quieta || revision.isFetching;
  const faltan = vista?.faltan ?? [];
  // Una línea del tarifario sin elegir: se elige o se quita.
  const sinElegir = pedida.lineas.some((l) => l.tarifario_id === null);
  const lista = !!vista?.ok && !revisando && !sinElegir;

  const enviarSolicitud = async () => {
    setEmitiendo(true);
    try {
      const s = await solicitarFactura(elegidas(pedida));
      toast.success(
        `Solicitud enviada por ${clp(s.total)}: la emite quien la aprueba.`,
      );
      setViendo(false);
      setPedida(inicial(esAdmin));
      void queryClient.invalidateQueries({ queryKey: LLAVE_DEL_TURNO });
    } catch (error) {
      toast.error(humanizeApiError(error, "No se pudo enviar la solicitud."));
    } finally {
      setEmitiendo(false);
    }
  };

  const emitir = async () => {
    setEmitiendo(true);
    try {
      const doc = await emitirFacturaSinEvento(pedida);
      if (doc.estado === "por_confirmar")
        toast.warn(
          "Se cortó la conexión con facturacion.cl: la factura queda por confirmar. No la emitas de nuevo.",
          { sticky: true },
        );
      else
        toast.success(
          `Factura N° ${doc.folio} emitida${marcaDelAmbiente(doc.ambiente)}.`,
        );
      // La ficha del cliente cambió (su razón social).
      void queryClient.invalidateQueries({ queryKey: LLAVE_CLIENTES });
      if (quedarse) {
        setViendo(false);
        setUltima(doc);
        setPedida(inicial(esAdmin));
      }
      onEmitida(doc);
    } catch (error) {
      toast.error(humanizeApiError(error, "No se pudo emitir la factura."));
    } finally {
      setEmitiendo(false);
    }
  };

  return (
    <div className="space-y-4">
      <CabeceraDelDocumento
        titulo="Nueva factura electrónica"
        folio={vista?.folio ?? null}
        onVolver={onVolver}
      />

      {ultima && (
        <p className="flex flex-wrap items-center gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
          Factura N° {ultima.folio} emitida.
          {ultima.pdf_path && (
            <FileViewLink
              url={ultima.pdf_path}
              title={`Factura ${ultima.folio}.pdf`}
            />
          )}
        </p>
      )}

      <SeccionDocumento
        pedida={pedida}
        vista={vista ?? null}
        onChange={poner}
        medioSiempre={solicita}
      />

      <Seccion titulo="Destinatario">
        <DestinatarioDeLaFactura
          clientes={clientes.data}
          cargando={clientes.isPending}
          pedida={pedida}
          poner={poner}
          onClienteCreado={() =>
            void queryClient.invalidateQueries({ queryKey: LLAVE_CLIENTES })
          }
        />
      </Seccion>

      <Seccion titulo="Ítems">
        {sinTarifario ? (
          <p className="text-sm text-gray-500">
            Todavía no hay tarifario: lo arma el administrador en «Tarifario».
          </p>
        ) : (
          <LineasDelDte
            lineas={pedida.lineas}
            montos={vista?.montos ?? null}
            onChange={(lineas) => poner({ lineas })}
            sinMarco
            conDescuento={esAdmin}
            tarifario={tarifario.data}
            soloTarifario={!esAdmin}
          />
        )}
      </Seccion>

      <Seccion titulo="Referencias">
        {pedida.referencias.length === 0 && (
          <p className="text-xs text-gray-500">
            Sin referencias. Si el cliente la pide, agrega su orden de compra,
            HES o contrato, con su fecha.
          </p>
        )}
        <ReferenciasDelDte
          referencias={pedida.referencias}
          onChange={(referencias) => poner({ referencias })}
        />
      </Seccion>

      <Seccion titulo="Totales">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1 basis-64 space-y-1 text-xs">
            {sinElegir && (
              <p className="text-amber-800">
                Elige del tarifario cada línea, o quítala.
              </p>
            )}
            {revisando && !vista ? (
              <p className="text-gray-400">Revisando…</p>
            ) : faltan.length > 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                Falta {faltan.map((f) => f.texto).join(", ")}.
              </p>
            ) : null}
            {vista?.avisos.map((a) => (
              <p key={a} className="text-gray-600">
                • {a}
              </p>
            ))}
            {vista?.problemas.map((p) => (
              <p key={p} className="text-red-600">
                • {p}
              </p>
            ))}
          </div>
          <TotalesDelDte montos={vista?.montos ?? null} />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onVolver}
            className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!lista}
            onClick={() => setViendo(true)}
            className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {revisando ? "Revisando…" : "Crear documento"}
          </button>
        </div>
      </Seccion>

      {viendo && vista && (
        <Modal
          titulo="Así sale la factura"
          ancho="max-w-3xl"
          bloquearEscape={emitiendo}
          onCerrar={() => !emitiendo && setViendo(false)}
        >
          <VistaPreviaDelDte
            vista={vista}
            pedida={pedida}
            puedeEmitir
            emitiendo={emitiendo || revisando}
            solicita={solicita}
            onVolver={() => setViendo(false)}
            onEmitir={() => void (solicita ? enviarSolicitud() : emitir())}
          />
        </Modal>
      )}

      {solicita && <SolicitudesDelTurno />}
    </div>
  );
}
