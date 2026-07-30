import { useEffect, useState } from "react";
import { X, Download, FileText } from "lucide-react";
import { QuotationWithClient } from "../types/quotations.types";
import { useAuth } from "../contexts/AuthContext";
import { getMenuOrder } from "../services/sections.service";
import {
  CategorySection,
  VariableServiceCategoryLink,
} from "../types/services.types";

// Visor de cotización + PDF al cliente (mockup aprobado 20-07).
// UNA sola plantilla HTML para la pantalla (el "ojo") y para imprimir:
// lo que se ve es exactamente lo que recibe el cliente.
//
// Reglas del documento (definidas por Felipe):
// - El cliente NO ve el detalle de platos ni precios internos: solo el
//   programa por día, los valores por audiencia (por persona × personas),
//   los servicios parciales como línea propia y los fijos en detalle.
// - La propina es "Propina sugerida" y si no existe NO aparece.
// - Neto/IVA se calculan sobre el total SIN propina (la propina no lleva
//   IVA y se suma al final).

import {
  buildQuotationPrintDoc,
  openQuotationPrintWindow,
} from "../utils/quotationPrintDoc";

interface QuotationViewerProps {
  quotation: QuotationWithClient;
  onClose: () => void;
}

const clp = (n: number) => "$" + Math.round(n || 0).toLocaleString("es-CL");

const esc = (s: string) =>
  String(s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

export default function QuotationViewer({
  quotation,
  onClose,
}: QuotationViewerProps) {
  const { company } = useAuth();

  // Orden de la carta (secciones): el "incluye" de cada servicio se lista
  // en el mismo orden que el menu, sin precios (el detalle de cobros es
  // interno). Mientras carga, se usa el orden del snapshot.
  const [menu, setMenu] = useState<{
    categories: { id: number; name: string }[];
    sections: CategorySection[];
    links: VariableServiceCategoryLink[];
  } | null>(null);
  useEffect(() => {
    if (company?.id) getMenuOrder(company.id).then(setMenu);
  }, [company?.id]);

  // La hoja completa (css + body) la arma el módulo COMPARTIDO
  // utils/quotationPrintDoc — la misma que usa el portal del mandante.
  // Cualquier cambio de diseño de la papeleta se hace allá.
  const { css, body } = buildQuotationPrintDoc(
    quotation,
    company ?? null,
    menu,
  );

  const handleDownloadPDF = (): void => {
    const ok = openQuotationPrintWindow(quotation, company ?? null, menu);
    if (!ok) {
      alert(
        "No se pudo abrir la ventana de impresión. Verifica que el bloqueador de ventanas emergentes esté deshabilitado.",
      );
    }
  };

  // ---------- Modal en pantalla: la MISMA hoja ----------
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[95vh] overflow-hidden">
        <div className="bg-blue-900 text-white px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <FileText className="h-5 w-5" />
              <h2 className="text-lg font-bold">
                Cotización #{quotation.quotation_number}
              </h2>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleDownloadPDF}
                className="bg-white bg-opacity-15 hover:bg-opacity-25 text-white px-4 py-2 rounded-lg flex items-center space-x-2 text-sm font-semibold"
              >
                <Download size={15} />
                <span>PDF</span>
              </button>
              <button
                onClick={onClose}
                className="text-white hover:text-blue-200"
              >
                <X size={22} />
              </button>
            </div>
          </div>
        </div>

        <div className="overflow-y-auto max-h-[calc(95vh-64px)] bg-gray-100 p-6">
          <style>{css}</style>
          <div
            className="shadow-lg mx-auto max-w-3xl"
            dangerouslySetInnerHTML={{ __html: body }}
          />
        </div>
      </div>
    </div>
  );
}
