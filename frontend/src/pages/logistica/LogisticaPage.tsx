import { useState } from "react";
import {
  ShoppingCart,
  Package,
  Truck,
  Users,
  Wrench,
} from "lucide-react";

type TabKey = "compras" | "insumos" | "proveedores" | "recursos";

const TABS: {
  key: TabKey;
  label: string;
  Icon: typeof ShoppingCart;
}[] = [
  { key: "compras", label: "Compras", Icon: ShoppingCart },
  { key: "insumos", label: "Insumos", Icon: Package },
  { key: "proveedores", label: "Proveedores", Icon: Truck },
  { key: "recursos", label: "Recursos de gestión", Icon: Users },
];

// Contenido de cada pestaña (esqueleto). Se completará por fases con datos
// reales; por ahora describe qué hará cada sección.
const PANELS: Record<
  TabKey,
  {
    Icon: typeof ShoppingCart;
    title: string;
    desc: string;
    action: string;
  }
> = {
  compras: {
    Icon: ShoppingCart,
    title: "Compras consolidadas por proveedor",
    desc: "Selecciona los eventos cerrados que vas a provisionar y genera una sola lista de compra, consolidada y agrupada por proveedor, con descarga a Excel. Los eventos quedan marcados como provisionados y sus costos de insumos se congelan.",
    action: "Generar compras",
  },
  insumos: {
    Icon: Package,
    title: "Catálogo de insumos",
    desc: "Ingredientes con su familia de unidad (masa kg/gr · volumen L/ml · unidad), precio base y proveedor. Es la fuente única de precios que usan las recetas y el costeo de cada evento.",
    action: "+ Nuevo insumo",
  },
  proveedores: {
    Icon: Truck,
    title: "Catálogo de proveedores",
    desc: "Listado simple de proveedores para agrupar las listas de compra. Cada insumo puede asociarse a un proveedor.",
    action: "+ Nuevo proveedor",
  },
  recursos: {
    Icon: Users,
    title: "Recursos de gestión",
    desc: "Staff y arriendos del evento (garzones, maestro de cocina, mesas, mantelería…). Aquí se define solo la lista; el precio se asigna por evento en la pestaña Gestión de cada evento.",
    action: "+ Nuevo recurso",
  },
};

export default function LogisticaPage() {
  const [tab, setTab] = useState<TabKey>("compras");
  const panel = PANELS[tab];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Logística</h1>
        <p className="text-sm text-gray-500">
          Planificación de compras, insumos, proveedores y recursos de gestión
        </p>
      </div>

      {/* Aviso de módulo en construcción */}
      <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-3">
        <Wrench className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
        <p className="text-sm text-amber-800">
          <span className="font-semibold">Módulo en construcción.</span> Esta es
          la estructura del módulo; cada pestaña se irá completando por fases
          (catálogos, recetas, compras y costeo).
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

        {/* Empty state de la pestaña activa */}
        <div className="p-10">
          <div className="mx-auto max-w-md text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
              <panel.Icon size={26} />
            </div>
            <h2 className="text-lg font-bold text-gray-900">{panel.title}</h2>
            <p className="mt-2 text-sm text-gray-500">{panel.desc}</p>
            <button
              type="button"
              disabled
              title="Disponible en una próxima fase"
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white opacity-50 cursor-not-allowed"
            >
              {panel.action}
            </button>
            <p className="mt-2 text-xs text-gray-400">Próximamente</p>
          </div>
        </div>
      </div>
    </div>
  );
}
