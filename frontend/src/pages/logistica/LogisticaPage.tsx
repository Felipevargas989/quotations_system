import { useState } from "react";
import { Package, ShoppingCart, Truck, Users } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import ProveedoresTab from "./components/ProveedoresTab";
import InsumosTab from "./components/InsumosTab";
import RecursosTab from "./components/RecursosTab";

type TabKey = "compras" | "insumos" | "proveedores" | "recursos";

const TABS: { key: TabKey; label: string; Icon: typeof ShoppingCart }[] = [
  { key: "compras", label: "Compras", Icon: ShoppingCart },
  { key: "insumos", label: "Insumos", Icon: Package },
  { key: "proveedores", label: "Proveedores", Icon: Truck },
  { key: "recursos", label: "Recursos de gestión", Icon: Users },
];

export default function LogisticaPage() {
  const { company } = useAuth();
  const [tab, setTab] = useState<TabKey>("compras");
  const companyId = company?.id ? Number(company.id) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Logística</h1>
        <p className="text-sm text-gray-500">
          Planificación de compras, insumos, proveedores y recursos de gestión
        </p>
      </div>

      {/* Tabs + panel */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="flex gap-1 px-4 border-b border-gray-200 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                tab === t.key
                  ? "text-blue-600 border-blue-600"
                  : "text-gray-500 border-transparent hover:text-gray-700"
              }`}
            >
              <t.Icon size={16} />
              {t.label}
            </button>
          ))}
        </div>

        {companyId === null ? (
          <div className="py-14 flex justify-center">
            <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
          </div>
        ) : (
          <>
            {tab === "compras" && (
              <div className="p-10">
                <div className="mx-auto max-w-md text-center">
                  <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
                    <ShoppingCart size={26} />
                  </div>
                  <h2 className="text-lg font-bold text-gray-900">
                    Compras consolidadas por proveedor
                  </h2>
                  <p className="mt-2 text-sm text-gray-500">
                    Selecciona los eventos cerrados que vas a provisionar y
                    genera una sola lista de compra, consolidada y agrupada por
                    proveedor, con descarga a Excel. Los eventos quedan
                    provisionados y sus costos de insumos se congelan.
                  </p>
                  <p className="mt-3 text-xs text-gray-400">
                    Próximamente (requiere recetas en los servicios)
                  </p>
                </div>
              </div>
            )}
            {tab === "insumos" && <InsumosTab companyId={companyId} />}
            {tab === "proveedores" && <ProveedoresTab companyId={companyId} />}
            {tab === "recursos" && <RecursosTab companyId={companyId} />}
          </>
        )}
      </div>
    </div>
  );
}
