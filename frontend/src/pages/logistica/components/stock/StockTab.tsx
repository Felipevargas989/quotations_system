import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getSuppliers,
  getSupplies,
} from "../../../../services/logistics.service";
import { getEstadoDeStock } from "../../../../services/stock.service";
import SubirCompras from "./SubirCompras";
import TablaDeCostos from "./TablaDeCostos";

// LA PESTAÑA «STOCK» DE PROVEEDORES (doc 25, 23-11-2026). Felipe: *"hacer
// otra pestaña que se llame stock, y ahí ir como actualizando"*. Arriba se
// suben las compras y se revisan con check; abajo, cada insumo con su
// costo y su última compra (la bodega salió el mismo día, D16).

export default function StockTab({
  companyId,
}: {
  readonly companyId: number;
}) {
  const queryClient = useQueryClient();
  const estadoQuery = useQuery({
    queryKey: ["logistica", "stock", companyId],
    queryFn: getEstadoDeStock,
  });
  const insumosQuery = useQuery({
    // Clave propia: la de Insumos guarda otra forma (mapa 06 §8.2).
    queryKey: ["logistica", "stock", "insumos", companyId],
    queryFn: () => getSupplies(companyId),
  });

  const refrescar = async (costosCambiados?: boolean) => {
    await queryClient.invalidateQueries({ queryKey: ["logistica"] });
    // Un costo nuevo mueve el margen de todas las pantallas (mapa 06 §7).
    if (costosCambiados) {
      await queryClient.invalidateQueries({ queryKey: ["postventa"] });
      await queryClient.invalidateQueries({ queryKey: ["recipeCosts"] });
    }
  };

  const proveedoresQuery = useQuery({
    queryKey: ["logistica", "stock", "proveedores", companyId],
    queryFn: () => getSuppliers(companyId),
  });

  if (estadoQuery.isLoading || insumosQuery.isLoading) {
    return (
      <div className="py-14 flex justify-center">
        <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
      </div>
    );
  }
  if (estadoQuery.isError) {
    return (
      <p className="p-6 text-sm text-red-600">
        No se pudo cargar el stock. Intenta de nuevo en un momento.
      </p>
    );
  }
  const estado = estadoQuery.data!;
  const supplies = insumosQuery.data ?? [];
  return (
    <div className="p-4 space-y-8">
      <SubirCompras
        compras={estado.compras}
        supplies={supplies}
        equivalentes={estado.equivalentes}
        onCambio={(c) => void refrescar(c)}
      />
      <TablaDeCostos
        supplies={supplies}
        proveedores={proveedoresQuery.data ?? []}
        equivalentes={estado.equivalentes}
        compras={estado.compras}
      />
    </div>
  );
}
