import { X, Download, FileText, CheckCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { QuotationWithClient } from "../types/quotations.types";
import { useAuth } from "../contexts/AuthContext";
import { formatISOUTCDateToString } from "../utils/dates";

interface QuotationViewerProps {
  quotation: QuotationWithClient;
  onClose: () => void;
}

export default function QuotationViewer({
  quotation,
  onClose,
}: QuotationViewerProps) {
  const { companyName } = useAuth();
  const getStatusColor = (status: string) => {
    switch (status) {
      case "solicitada":
        return "bg-yellow-100 text-yellow-800";
      case "enviada":
        return "bg-blue-100 text-blue-800";
      case "en_negociacion":
        return "bg-purple-100 text-purple-800";
      case "aceptada":
        return "bg-green-100 text-green-800";
      case "rechazada":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "solicitada":
        return "📋 Solicitada";
      case "enviada":
        return "📤 Enviada";
      case "en_negociacion":
        return "💬 En Negociación";
      case "aceptada":
        return "✅ Aceptada";
      case "rechazada":
        return "❌ Rechazada";
      default:
        return status;
    }
  };

  const handleDownloadPDF = (): void => {
    // Crear una nueva ventana para imprimir
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert(
        "No se pudo abrir la ventana de impresión. Verifica que el bloqueador de ventanas emergentes esté deshabilitado.",
      );
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cotización ${quotation.quotation_number} - ${companyName || "Empresa"}</title>
          <style>
            * {
              margin: 0;
              padding: 0;
              box-sizing: border-box;
            }
            body {
              font-family: 'Montserrat', 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
              margin: 0;
              color: #2c3e50;
              line-height: 1.6;
              font-size: 13px;
              background: #fff;
            }
            .header {
              background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
              color: white;
              padding: 12px 15px;
              text-align: center;
              position: relative;
              overflow: hidden;
              display: flex;
              justify-content: space-between;
              align-items: center;
            }
            .header::before {
              content: '';
              position: absolute;
              top: 0;
              left: 0;
              right: 0;
              bottom: 0;
              background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><circle cx="20" cy="20" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="80" cy="80" r="2" fill="rgba(255,255,255,0.1)"/><circle cx="40" cy="60" r="1" fill="rgba(255,255,255,0.1)"/></svg>');
              opacity: 0.3;
            }
            .logo-section {
              position: relative;
              z-index: 1;
              flex: 1;
            }
            .header-logo {
              position: relative;
              z-index: 1;
              width: 120px;
              height: 100px;
            }
            .header-center {
              flex: 1;
              text-align: center;
            }
            .company-name {
              font-size: 18px;
              font-weight: 700;
              margin-bottom: 3px;
            }
            .company-subtitle {
              font-size: 13px;
              color: rgba(255,255,255,0.9);
              font-weight: 300;
            }
            .quotation-title {
              font-size: 14px;
              color: #fff;
              margin: 8px 0 3px 0;
              font-weight: 600;
              letter-spacing: 1px;
            }
            .quotation-number {
              font-size: 12px;
              color: rgba(255,255,255,0.9);
              background: rgba(255,255,255,0.2);
              padding: 3px 10px;
              border-radius: 12px;
              display: inline-block;
              backdrop-filter: blur(10px);
            }
            .section {
              background: #f8fafc;
              border: 1px solid #e2e8f0;
              border-radius: 4px;
              padding: 6px;
              margin: 4px 3px;
              box-shadow: 0 1px 2px rgba(0,0,0,0.05);
            }
            .section h3 {
              font-size: 12px;
              font-weight: 600;
              color: #1a202c;
              margin-bottom: 4px;
              border-bottom: 1px solid #667eea;
              padding-bottom: 2px;
            }
            .info-grid {
              display: grid;
              grid-template-columns: repeat(3, 1fr);
              gap: 3px;
              margin-bottom: 4px;
            }
            .info-item {
              background: white;
              padding: 3px;
              border-radius: 2px;
              border-left: 2px solid #667eea;
              box-shadow: 0 1px 1px rgba(0,0,0,0.1);
            }
            .info-label {
              font-weight: 600;
              color: #4a5568;
              font-size: 9px;
              text-transform: uppercase;
              letter-spacing: 0.3px;
              margin-bottom: 1px;
              display: block;
            }
            .info-value {
              color: #1a202c;
              font-size: 11px;
              font-weight: 500;
            }
            .status-badge {
              display: inline-block;
              padding: 4px 8px;
              border-radius: 12px;
              font-size: 10px;
              font-weight: 600;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .status-aceptada { background: linear-gradient(135deg, #10b981, #059669); color: white; }
            .status-enviada { background: linear-gradient(135deg, #3b82f6, #1d4ed8); color: white; }
            .status-en_negociacion { background: linear-gradient(135deg, #8b5cf6, #7c3aed); color: white; }
            .status-solicitada { background: linear-gradient(135deg, #f59e0b, #d97706); color: white; }
            .status-rechazada { background: linear-gradient(135deg, #ef4444, #dc2626); color: white; }

            .pricing-summary {
              background: white;
              border-radius: 4px;
              margin: 3px;
              box-shadow: 0 1px 2px rgba(0,0,0,0.1);
              overflow: hidden;
            }
            .pricing-header {
              background: linear-gradient(135deg, #1e3a8a 0%, #3730a3 100%);
              color: white;
              padding: 8px;
              text-align: center;
            }
            .pricing-header h3 {
              font-size: 12px;
              font-weight: 600;
              margin-bottom: 1px;
            }
            .pricing-subtitle {
              font-size: 10px;
              opacity: 0.9;
            }
            .pricing-content {
              padding: 6px;
            }
            .pricing-row {
              display: flex;
              justify-content: space-between;
              align-items: center;
              padding: 3px 0;
              border-bottom: 1px solid #f1f5f9;
            }
            .pricing-row:last-child {
              border-bottom: none;
            }
            .pricing-label {
              font-weight: 500;
              color: #4a5568;
              font-size: 11px;
            }
            .pricing-value {
              font-weight: 600;
              color: #1a202c;
              font-size: 11px;
            }
            .total-label {
              font-weight: 700;
              color: #1a202c;
              font-size: 12px;
            }
            .total-value {
              font-weight: 700;
              color: #059669;
              font-size: 14px;
            }
            .discount-row .pricing-value {
              color: #dc2626;
            }
            .observations {
              background: #f0f9ff;
              border: 1px solid #bae6fd;
              border-radius: 4px;
              padding: 6px;
              margin: 4px 3px;
            }
            .observations h4 {
              font-size: 11px;
              font-weight: 600;
              color: #0369a1;
              margin-bottom: 3px;
            }
            .observations p {
              font-size: 10px;
              color: #0c4a6e;
              line-height: 1.3;
            }
            .footer {
              background: #f8fafc;
              border-top: 1px solid #e2e8f0;
              padding: 6px 4px;
              margin-top: 8px;
              text-align: center;
            }
            .footer-content {
              display: flex;
              justify-content: space-between;
              align-items: center;
              font-size: 9px;
              color: #64748b;
            }
            .footer-left p, .footer-right p {
              margin: 1px 0;
            }
            .services-section {
              background: white;
              border-radius: 4px;
              margin: 3px;
              box-shadow: 0 1px 2px rgba(0,0,0,0.1);
              overflow: hidden;
            }
            .services-header {
              background: linear-gradient(135deg, #059669 0%, #047857 100%);
              color: white;
              padding: 8px;
              text-align: center;
            }
            .services-header h3 {
              font-size: 12px;
              font-weight: 600;
              margin-bottom: 1px;
            }
            .services-subtitle {
              font-size: 10px;
              opacity: 0.9;
            }
            .services-content {
              padding: 6px;
            }
            .category-group {
              margin-bottom: 4px;
              page-break-inside: avoid;
            }
            .category-title {
              font-size: 11px;
              font-weight: 600;
              color: #059669;
              margin-bottom: 3px;
              padding-bottom: 1px;
              border-bottom: 1px solid #059669;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            .service-item {
              display: flex;
              align-items: center;
              padding: 2px 0;
              border-bottom: 1px solid #f1f5f9;
              font-size: 10px;
            }
            .service-item:last-child {
              border-bottom: none;
            }
            .service-name {
              flex: 1;
              color: #374151;
              font-weight: 500;
              font-size: 10px;
            }
            .service-quantity {
              color: #6b7280;
              font-size: 9px;
              margin-left: 4px;
            }
            .service-check {
              color: #059669;
              font-weight: bold;
              margin-left: 4px;
            }
            .fixed-services {
              background: linear-gradient(135deg, #7c3aed 0%, #6d28d9 100%);
            }
            .variable-services {
              background: linear-gradient(135deg, #059669 0%, #047857 100%);
            }
            @media print {
              body { margin: 0; }
              .header { break-inside: avoid; }
              .section { break-inside: avoid; }
              .pricing-summary { break-inside: avoid; }
              .services-section { break-inside: avoid; }
              .category-group { break-inside: avoid; }
              .page-break { page-break-before: always; }
            }
          </style>
        </head>
        <body>
          <!-- Header -->
          <div class="header">
            <div class="logo-section">
              <div class="company-name">${companyName || "Empresa"}</div>
            </div>
            <div class="header-center">
              <div class="quotation-title">COTIZACIÓN DE SERVICIOS</div>
              <div class="quotation-number">N° ${quotation.quotation_number}</div>
            </div>
          </div>

          <!-- Client Information -->
          <div class="section">
            <h3>Información del Cliente y Evento</h3>
            <div class="info-grid">
              <div class="info-item">
                <span class="info-label">Cliente</span>
                <span class="info-value">${quotation.clients.name}</span>
              </div>
              <div class="info-item">
                <span class="info-label">Fecha Cotización</span>
                <span class="info-value">${format(new Date(quotation.created_at), "dd/MM/yyyy", { locale: es })}</span>
              </div>
              ${
                quotation.event_date
                  ? `
              <div class="info-item">
                <span class="info-label">Fecha Evento</span>
                <span class="info-value">${formatISOUTCDateToString(quotation.event_date)}</span>
              </div>
              `
                  : ""
              }
              <div class="info-item">
                <span class="info-label">Personas</span>
                <span class="info-value">${quotation.people_count}</span>
              </div>
              ${
                quotation.event_type
                  ? `
              <div class="info-item">
                <span class="info-label">Tipo Evento</span>
                <span class="info-value">${quotation.event_type}</span>
              </div>
              `
                  : ""
              }
              <div class="info-item">
                <span class="info-label">Estado</span>
                <span class="status-badge status-${quotation.quotation_status}">${getStatusText(quotation.quotation_status)}</span>
              </div>
            </div>
          </div>

          <!-- Pricing Summary -->
          <div class="pricing-summary">
            <div class="pricing-header">
              <h3>Resumen de Cotización</h3>
              <div class="pricing-subtitle">Servicios integrales para su evento</div>
            </div>
            <div class="pricing-content">
              <div class="pricing-row">
                <span class="pricing-label">Subtotal (Base)</span>
                <span class="pricing-value">$${Math.round(quotation.total_amount / 1.19).toLocaleString()}</span>
              </div>
              <div class="pricing-row">
                <span class="pricing-label">IVA (19%)</span>
                <span class="pricing-value">$${Math.round(quotation.total_amount - quotation.total_amount / 1.19).toLocaleString()}</span>
              </div>
              <div class="pricing-row">
                <span class="total-label">Total General</span>
                <span class="total-value">$${quotation.total_amount.toLocaleString()}</span>
              </div>
            </div>
          </div>

          ${
            quotation.items &&
            quotation.items.variable_services &&
            quotation.items.variable_services.length > 0
              ? `
          <!-- Detailed Services List -->
          <div class="services-section">
            <div class="services-header variable-services">
              <h3>Servicios Variables</h3>
              <div class="services-subtitle">Servicios por persona • ${quotation.people_count} personas</div>
            </div>
            <div class="services-content">
              ${quotation.items.variable_services
                .map(
                  (categoryGroup) => `
                <div class="category-group">
                  <div class="category-title">${categoryGroup.category}</div>
                  ${categoryGroup.items
                    .map(
                      (service) => `
                    <div class="service-item">
                      <span class="service-name">${service.nombre}</span>
                      ${service.quantity > 1 ? `<span class="service-quantity">(x${service.quantity})</span>` : ""}
                      <span class="service-check">✓</span>
                    </div>
                  `,
                    )
                    .join("")}
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
          `
              : ""
          }

          ${
            quotation.items &&
            quotation.items.fixed_services &&
            quotation.items.fixed_services.length > 0
              ? `
          <!-- Fixed Services List -->
          <div class="services-section">
            <div class="services-header fixed-services">
              <h3>Servicios Fijos</h3>
              <div class="services-subtitle">Servicios independientes del número de personas</div>
            </div>
            <div class="services-content">
              ${quotation.items.fixed_services
                .map(
                  (service) => `
                <div class="service-item">
                  <span class="service-name">${service.nombre}</span>
                  ${service.quantity > 1 ? `<span class="service-quantity">(x${service.quantity})</span>` : ""}
                  <span class="service-check">✓</span>
                </div>
              `,
                )
                .join("")}
            </div>
          </div>
          `
              : ""
          }

          <!-- Terms and Conditions -->
          <div class="pricing-summary">
            <div class="pricing-header">
              <h3>Condiciones</h3>
              <div class="pricing-subtitle">Válido 30 días desde la fecha de emisión</div>
            </div>
            <div class="pricing-content">
              <div class="pricing-row">
                <span class="pricing-label">Número de Personas</span>
                <span class="pricing-value">${quotation.people_count}</span>
              </div>
              <div class="pricing-row">
                <span class="pricing-label">Emisión: ${format(new Date(quotation.created_at), "dd/MM/yyyy", { locale: es })}</span>
                <span class="pricing-value">CLP</span>
              </div>
              <div class="pricing-row">
                <span class="total-label">Estado</span>
                <span class="total-value">${getStatusText(quotation.quotation_status)}</span>
              </div>
            </div>
          </div>

          ${
            quotation.observations
              ? `
          <!-- Observaciones -->
          <div class="observations">
            <h4>Observaciones</h4>
            <p>${quotation.observations}</p>
          </div>
          `
              : ""
          }

          <!-- Footer -->
          <div class="footer">
            <div class="footer-content">
              <div class="footer-left">
                <p>Cotización generada el ${format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })}</p>
                <p>Documento válido por 30 días desde la fecha de emisión</p>
              </div>
              <div class="footer-right">
                <p>${companyName || "Empresa"}</p>
              </div>
            </div>
          </div>
        </body>
      </html>
    `);

    printWindow.document.close();

    // Esperar a que se cargue el contenido y luego imprimir
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[95vh] overflow-hidden">
        {/* Header del modal */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="bg-white bg-opacity-20 p-2 rounded-lg">
                <FileText className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">
                  Cotización #{quotation.quotation_number}
                </h2>
                <p className="text-blue-100 text-sm">
                  {quotation.clients.name} •{" "}
                  {format(new Date(quotation.created_at), "dd/MM/yyyy", {
                    locale: es,
                  })}
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleDownloadPDF}
                className="bg-white bg-opacity-20 hover:bg-opacity-30 text-white px-4 py-2 rounded-lg transition-all duration-200 flex items-center space-x-2"
              >
                <Download size={16} />
                <span>PDF</span>
              </button>
              <button
                onClick={onClose}
                className="text-white hover:text-blue-100 transition-colors duration-200"
              >
                <X size={24} />
              </button>
            </div>
          </div>
        </div>

        {/* Contenido de la cotización */}
        <div className="overflow-y-auto max-h-[calc(95vh-120px)]">
          <div id="quotation-content" className="p-8 space-y-8">
            {/* Status Badge */}
            <div className="flex justify-center">
              <span
                className={`inline-flex items-center px-4 py-2 rounded-full text-sm font-medium ${getStatusColor(quotation.quotation_status)}`}
              >
                {getStatusText(quotation.quotation_status)}
              </span>
            </div>

            {/* Client and Event Information */}
            <div className="bg-gray-50 rounded-xl p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <div className="w-2 h-2 bg-blue-600 rounded-full mr-3"></div>
                Información del Cliente y Evento
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <p className="text-sm text-gray-600 mb-1">Cliente</p>
                  <p className="font-medium text-gray-900">
                    {quotation.clients.name}
                  </p>
                </div>
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <p className="text-sm text-gray-600 mb-1">Fecha Cotización</p>
                  <p className="font-medium text-gray-900">
                    {format(new Date(quotation.created_at), "dd/MM/yyyy", {
                      locale: es,
                    })}
                  </p>
                </div>
                {quotation.event_date && (
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-600 mb-1">Fecha Evento</p>
                    <p className="font-medium text-gray-900">
                      {formatISOUTCDateToString(quotation.event_date)}
                    </p>
                  </div>
                )}
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <p className="text-sm text-gray-600 mb-1">
                    Número de Personas
                  </p>
                  <p className="font-medium text-gray-900">
                    {quotation.people_count}
                  </p>
                </div>
                {quotation.event_type && (
                  <div className="bg-white p-4 rounded-lg border border-gray-200">
                    <p className="text-sm text-gray-600 mb-1">Tipo de Evento</p>
                    <p className="font-medium text-gray-900">
                      {quotation.event_type}
                    </p>
                  </div>
                )}
                <div className="bg-white p-4 rounded-lg border border-gray-200">
                  <p className="text-sm text-gray-600 mb-1">
                    Valor por Persona
                  </p>
                  <p className="font-medium text-gray-900">
                    $
                    {Math.round(
                      quotation.total_amount / quotation.people_count,
                    ).toLocaleString()}
                  </p>
                </div>
              </div>
            </div>

            {/* Pricing Summary */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 rounded-xl p-6 border border-blue-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <div className="w-2 h-2 bg-green-600 rounded-full mr-3"></div>
                Resumen de Cotización
              </h3>
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="space-y-3">
                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">Subtotal (Base)</span>
                    <span className="font-medium">
                      $
                      {Math.round(
                        quotation.total_amount / 1.19,
                      ).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-2 border-b border-gray-100">
                    <span className="text-gray-600">IVA (19%)</span>
                    <span className="font-medium">
                      $
                      {Math.round(
                        quotation.total_amount - quotation.total_amount / 1.19,
                      ).toLocaleString()}
                    </span>
                  </div>

                  <div className="flex justify-between items-center py-3 border-t-2 border-green-200">
                    <span className="text-lg font-semibold text-gray-900">
                      Total General
                    </span>
                    <span className="text-2xl font-bold text-green-600">
                      ${quotation.total_amount.toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Services List */}
            {quotation.items &&
              quotation.items.variable_services &&
              quotation.items.variable_services.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <div className="w-2 h-2 bg-green-600 rounded-full mr-3"></div>
                    Servicios Variables
                  </h3>
                  <div className="space-y-4">
                    {quotation.items.variable_services.map(
                      (categoryGroup, categoryIndex) => (
                        <div
                          key={categoryIndex}
                          className="bg-white p-4 rounded-lg border border-gray-200"
                        >
                          <h4 className="font-semibold text-gray-900 mb-3 text-sm uppercase tracking-wide border-b border-gray-200 pb-2">
                            {categoryGroup.category}
                          </h4>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            {categoryGroup.items.map(
                              (service, serviceIndex) => (
                                <div
                                  key={serviceIndex}
                                  className="flex items-center justify-between p-2 bg-gray-50 rounded"
                                >
                                  <div className="flex items-center space-x-3">
                                    <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                                    <span className="font-medium text-gray-900 text-sm">
                                      {service.nombre}
                                      {service.quantity > 1 && (
                                        <span className="text-xs text-gray-500 ml-2">
                                          (x{service.quantity})
                                        </span>
                                      )}
                                    </span>
                                  </div>
                                  <div className="text-green-600">
                                    <CheckCircle size={14} />
                                  </div>
                                </div>
                              ),
                            )}
                          </div>
                        </div>
                      ),
                    )}
                  </div>
                </div>
              )}

            {/* Fixed Services List */}
            {quotation.items &&
              quotation.items.fixed_services &&
              quotation.items.fixed_services.length > 0 && (
                <div className="bg-gray-50 rounded-xl p-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                    <div className="w-2 h-2 bg-purple-600 rounded-full mr-3"></div>
                    Servicios Fijos
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {quotation.items.fixed_services.map((service, index) => (
                      <div
                        key={index}
                        className="bg-white p-4 rounded-lg border border-gray-200 flex items-center justify-between"
                      >
                        <div className="flex items-center space-x-3">
                          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                          <span className="font-medium text-gray-900">
                            {service.nombre}
                            {service.quantity > 1 && (
                              <span className="text-sm text-gray-500 ml-2">
                                (x{service.quantity})
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="text-purple-600">
                          <CheckCircle size={16} />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

            {/* Terms and Conditions */}
            <div className="bg-amber-50 rounded-xl p-6 border border-amber-200">
              <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                <div className="w-2 h-2 bg-amber-600 rounded-full mr-3"></div>
                Condiciones y Validez
              </h3>
              <div className="bg-white rounded-lg p-6 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600">Emisión</span>
                    <span className="font-medium">
                      {format(new Date(quotation.created_at), "dd/MM/yyyy", {
                        locale: es,
                      })}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600">Válido por</span>
                    <span className="font-medium">30 días</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600">Moneda</span>
                    <span className="font-medium">CLP (Pesos Chilenos)</span>
                  </div>
                  <div className="flex justify-between items-center py-2">
                    <span className="text-gray-600">Estado actual</span>
                    <span
                      className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(quotation.quotation_status)}`}
                    >
                      {getStatusText(quotation.quotation_status)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Observaciones */}
            {quotation.observations && (
              <div className="bg-blue-50 rounded-xl p-6 border border-blue-200">
                <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
                  <div className="w-2 h-2 bg-blue-600 rounded-full mr-3"></div>
                  Observaciones
                </h3>
                <div className="bg-white rounded-lg p-6 shadow-sm">
                  <p className="text-gray-700 leading-relaxed">
                    {quotation.observations}
                  </p>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="bg-gray-100 rounded-xl p-6 text-center">
              <div className="flex items-center justify-center space-x-2 mb-2">
                <span className="font-semibold text-gray-900">
                  {companyName || "Empresa"}
                </span>
              </div>
              <p className="text-sm text-gray-600">
                Cotización generada el{" "}
                {format(new Date(), "dd/MM/yyyy HH:mm", { locale: es })} •
                Documento válido por 30 días desde la fecha de emisión
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
