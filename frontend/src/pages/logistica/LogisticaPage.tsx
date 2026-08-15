import { useState } from "react";
import { Package, ShoppingCart, Truck, Users } from "lucide-react";
import { useAuth } from "../../contexts/AuthContext";
import ComprasTab from "./components/ComprasTab";
import ProveedoresTab from "./components/ProveedoresTab";
import InsumosTab from "./components/InsumosTab";
import RecursosTab from "./components/RecursosTab";

type TabKey = "compras" | "insumos" | "proveedores" | "recursos";

const TABS: { key: TabKey; label: string; Icon: typeof ShoppingCart }[] = [
  { key: "compras", label: "Compras", Icon: ShoppingCart },
  { key: "insumos", label: "Insumos", Icon: Package },
  { key: "proveedores", label: "Proveedores", Icon: Truck },
  { key: "recursos", label: "Servicios externos", Icon: Users },
];

export default function LogisticaPage() {
  const { company } = useAuth();
  const [tab, setTab] = useState<TabKey>("compras");
  const companyId = company?.id ? Number(company.id) : null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        {/* 15-08 (Felipe): el módulo se llama Proveedores — todo lo que se
            le COMPRA a alguien. El mobiliario se fue a Inventario: eso ya
            es nuestro y solo se cuenta y cuida. */}
        <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
        <p className="text-sm text-gray-500">
          Compras, insumos, proveedores y servicios externos
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
            {tab === "compras" && <ComprasTab companyId={companyId} />}
            {tab === "insumos" && <InsumosTab companyId={companyId} />}
            {tab === "proveedores" && <ProveedoresTab companyId={companyId} />}
            {tab === "recursos" && <RecursosTab companyId={companyId} />}
          </>
        )}
      </div>
    </div>
  );
}
