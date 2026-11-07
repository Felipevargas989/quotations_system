import { useState, type ReactNode } from "react";
import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import Modal from "../../components/Modal";
import { toast } from "../../components/toast/Toast";
import { marcaDelAmbiente } from "../../constants/facturacion";
import {
  emitirFacturaSinEvento,
  getClientesParaFacturar,
  revisarFacturaSinEvento,
  type DocumentoTributario,
  type DtePedido,
} from "../../services/facturas.service";
import { humanizeApiError } from "../../utils/apiErrors";
import { fechaCorta } from "../../utils/ordenesDeCompra";
import CondicionDePago from "../postventa/facturacion/CondicionDePago";
import LineasDelDte, {
  TotalesDelDte,
} from "../postventa/facturacion/LineasDelDte";
import ReferenciasDelDte from "../postventa/facturacion/ReferenciasDelDte";
import VistaPreviaDelDte from "../postventa/facturacion/VistaPreviaDelDte";
import {
  RECEPTOR_VACIO,
  useQuieto,
} from "../postventa/facturacion/datosDeLaFactura";
import DestinatarioDeLaFactura from "./DestinatarioDeLaFactura";

// LA FACTURA DE «NUEVO DOCUMENTO» (doc 19 §9.22), como la maqueta que
// aprobó Felipe el 06-11 (*"está perfecto (…) me gusta toda la
// usabilidad"*): su propia pantalla, con el Documento (la fecha y la
// condición de pago, crédito a 30 días si no se dice), el Destinatario
// (buscado en Clientes o creado nuevo), los Ítems, las Referencias y los
// Totales. «Crear documento» muestra la factura tal como saldrá, y ahí se
// emite. La revisión es la del motor: la misma que emite.

const LLAVE_CLIENTES = ["facturacion", "clientes"];

const INICIAL: DtePedido = {
  tipo: 33,
  orden_de_compra_id: null,
  receptor: RECEPTOR_VACIO,
  lineas: [
    { descripcion: "", descripcion_larga: null, cantidad: 1, precio: 0 },
  ],
  referencias: [],
  pedir_siempre: [],
  forma_de_pago: 2,
  plazo_dias: 30,
  cliente_id: null,
};

function Seccion({
  titulo,
  children,
}: {
  readonly titulo: string;
  readonly children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-gray-200 bg-white p-4">
      <h2 className="text-sm font-semibold text-gray-900">{titulo}</h2>
      {children}
    </section>
  );
}

export default function FacturaNueva({
  puedeEmitir,
  onVolver,
  onEmitida,
}: {
  readonly puedeEmitir: boolean;
  readonly onVolver: () => void;
  readonly onEmitida: (doc: DocumentoTributario) => void;
}) {
  const queryClient = useQueryClient();
  const [pedida, setPedida] = useState<DtePedido>(INICIAL);
  const [viendo, setViendo] = useState(false);
  const [emitiendo, setEmitiendo] = useState(false);
  const poner = (cambios: Partial<DtePedido>) =>
    setPedida((p) => ({ ...p, ...cambios }));

  const clientes = useQuery({
    queryKey: LLAVE_CLIENTES,
    queryFn: getClientesParaFacturar,
    staleTime: 60_000,
  });
  // La vista previa se pide cuando se deja de escribir, no en cada tecla.
  const quieta = useQuieto(pedida);
  const revision = useQuery({
    queryKey: ["facturacion", "revisar", "nuevo-documento", quieta],
    queryFn: () => revisarFacturaSinEvento(quieta),
    placeholderData: keepPreviousData,
    refetchOnWindowFocus: false,
    gcTime: 0,
  });
  const vista = revision.data;
  const revisando = pedida !== quieta || revision.isFetching;
  const faltan = vista?.faltan ?? [];
  const lista = !!vista?.ok && !revisando;

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
      onEmitida(doc);
    } catch (error) {
      toast.error(humanizeApiError(error, "No se pudo emitir la factura."));
    } finally {
      setEmitiendo(false);
    }
  };

  return (
    <div className="space-y-4">
      <button
        type="button"
        onClick={onVolver}
        className="flex items-center gap-1 text-sm font-semibold text-blue-600 hover:underline"
      >
        <ArrowLeft size={15} /> Documentos
      </button>
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold text-gray-900">
          Nueva factura electrónica
        </h1>
        {vista && (
          <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
            N° {vista.folio} · el siguiente
          </span>
        )}
      </div>

      <Seccion titulo="Documento">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
          <div className="space-y-1">
            <p className="text-xs text-gray-500">Fecha de emisión</p>
            <p className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-1.5 text-sm text-gray-700">
              {vista ? fechaCorta(vista.fecha) : "—"}
            </p>
          </div>
          <div className="min-w-0 flex-1">
            <CondicionDePago
              pedida={pedida}
              fecha={vista?.fecha ?? null}
              onChange={poner}
            />
          </div>
        </div>
      </Seccion>

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
        <LineasDelDte
          lineas={pedida.lineas}
          montos={vista?.montos ?? null}
          onChange={(lineas) => poner({ lineas })}
          sinMarco
        />
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
            puedeEmitir={puedeEmitir}
            emitiendo={emitiendo || revisando}
            onVolver={() => setViendo(false)}
            onEmitir={() => void emitir()}
          />
        </Modal>
      )}
    </div>
  );
}
