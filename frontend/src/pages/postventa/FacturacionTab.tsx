import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileText } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import { getOrdenesDeCompra } from "../../services/ordenesDeCompra.service";
import { getDocumentosTributarios } from "../../services/facturas.service";
import { docsQueryOpts } from "./consultaDeDocumentos";
import EmitirDte from "./facturacion/EmitirDte";
import DocumentosEmitidos from "./facturacion/DocumentosEmitidos";
import LetreroDelAmbiente from "../facturacion/LetreroDelAmbiente";

// PESTAÑA «FACTURACIÓN» DEL EVENTO (doc 19 §9.20): emitir el DTE.
//
// Felipe, 05-11: *"finalmente esto es emitir DTE. Y yo puedo elegir si el
// DTE es una factura, una boleta y punto"*. «Emitir DTE» abre el borrador
// de BelIA: lee las órdenes de compra que están en Documentos (categoría
// «Órdenes de compra») y el DTE se llena solo desde la OC o desde la
// cotización, y se edita a mano. Abajo, lo emitido. Las boletas por cabaña
// de recepción viven en la sección Facturación, no acá.

export default function FacturacionTab({
  quotationId,
  clientId,
}: {
  readonly quotationId: string;
  readonly clientId: string | null;
}) {
  const queryClient = useQueryClient();
  const { userRole } = useAuth();
  const llaveDeDocumentos = ["facturacion", "documentos", quotationId];
  const llaveDeLasOrdenes = ["facturacion", "ordenes", quotationId];
  const emitidos = useQuery({
    queryKey: llaveDeDocumentos,
    queryFn: () => getDocumentosTributarios(quotationId),
  });
  // Las OC, para nombrar la de cada factura emitida.
  const ordenes = useQuery({
    queryKey: llaveDeLasOrdenes,
    queryFn: () => getOrdenesDeCompra(quotationId),
  });
  const [abierto, setAbierto] = useState(false);

  const emitido = async () => {
    setAbierto(false);
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: llaveDeDocumentos }),
      queryClient.invalidateQueries({ queryKey: llaveDeLasOrdenes }),
      queryClient.invalidateQueries({
        queryKey: ["razonesSociales", clientId],
      }),
      queryClient.invalidateQueries({
        queryKey: docsQueryOpts(quotationId).queryKey,
      }),
    ]);
  };

  return (
    <div className="max-w-3xl space-y-4">
      <LetreroDelAmbiente
        ambiente={emitidos.data?.ambiente}
        sinConexion={emitidos.data?.sin_conexion}
        que="Los documentos"
      />
      {abierto ? (
        <EmitirDte
          quotationId={quotationId}
          puedeEmitir={userRole === "administrador"}
          onCerrar={() => setAbierto(false)}
          onEmitido={emitido}
        />
      ) : (
        <button
          type="button"
          onClick={() => setAbierto(true)}
          className="flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          <FileText size={15} /> Emitir DTE
        </button>
      )}

      <DocumentosEmitidos
        documentos={emitidos.data?.documentos ?? []}
        ocs={ordenes.data ?? []}
      />
    </div>
  );
}
