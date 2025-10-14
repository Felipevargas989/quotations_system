import { Check, Sparkles, ArrowRight } from "lucide-react";

export default function Plans() {
  const handleSubscribeClick = () => {
    window.open(
      "https://www.mercadopago.cl/subscriptions/checkout?preapproval_plan_id=0244188ac3df4359825f610330d67f03",
      "_blank",
    );
  };

  const features = [
    "Gestión completa de cotizaciones",
    "Seguimiento de clientes y pagos",
    "Calendario de eventos integrado",
    "Reportes y analytics detallados",
    "Soporte técnico prioritario",
    "Actualizaciones automáticas",
    "Acceso a todas las funcionalidades",
    "Sin límites de uso",
  ];

  return (
    <div className="min-h-screen bg-gray-50 py-6">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Plan Card - 2 Column Layout */}
        <div className="flex justify-center">
          <div className="bg-white rounded-2xl shadow-2xl border border-gray-200 max-w-5xl w-full overflow-hidden">
            <div className="grid grid-cols-1 lg:grid-cols-2 min-h-[500px]">
              {/* Left Column - Features */}
              <div className="p-8 flex flex-col justify-center">
                <div className="flex items-center mb-6">
                  <Sparkles className="h-8 w-8 text-blue-600 mr-3" />
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">
                      Eventia Professional
                    </h2>
                    <p className="text-gray-600 text-sm">
                      Plan mensual con todas las funcionalidades
                    </p>
                  </div>
                </div>

                <h3 className="text-lg font-semibold text-gray-900 mb-4">
                  Todo lo que incluye:
                </h3>
                <ul className="space-y-3 mb-8">
                  {features.map((feature) => (
                    <li key={feature} className="flex items-start">
                      <Check className="h-5 w-5 text-green-500 mr-3 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">{feature}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Right Column - Pricing */}
              <div className="bg-gradient-to-br from-blue-600 to-purple-600 p-8 flex flex-col justify-center text-white">
                <div className="text-center">
                  <div className="text-5xl font-bold mb-2">$10.000</div>
                  <div className="text-blue-100 mb-4">CLP / mes</div>

                  <div className="text-sm text-blue-200 space-y-2 mb-8">
                    <div>$11.900 CLP total (incluye IVA)</div>
                    <div>≈ $10 USD + IVA</div>
                  </div>

                  {/* Subscribe Button */}
                  <button
                    onClick={handleSubscribeClick}
                    className="w-full bg-white text-blue-600 hover:bg-gray-100 font-semibold py-4 px-6 rounded-xl transition-all duration-200 flex items-center justify-center group mb-4"
                  >
                    <span className="mr-2">Suscribirse Ahora</span>
                    <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform" />
                  </button>

                  {/* Security Badge */}
                  <p className="text-xs text-blue-200 flex items-center justify-center">
                    <svg
                      className="h-3 w-3 mr-1"
                      fill="currentColor"
                      viewBox="0 0 20 20"
                    >
                      <path
                        fillRule="evenodd"
                        d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                        clipRule="evenodd"
                      />
                    </svg>
                    Pago seguro por Mercado Pago
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-8 text-center">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-3xl mx-auto">
            <h3 className="text-xl font-bold text-gray-900 mb-3">
              ¿Tienes preguntas sobre el plan?
            </h3>
            <p className="text-gray-600 mb-4 text-sm">
              Nuestro equipo está aquí para ayudarte. Contacta con nosotros para
              resolver cualquier duda.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <a
                href="https://calendly.com/hola-eventi-app/30min"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors text-sm"
              >
                <span>Agendar Demo</span>
              </a>
              <button
                onClick={() =>
                  window.open(
                    "https://api.whatsapp.com/send/?phone=%2B56940589151&text&type=phone_number&app_absent=0&message=Hola, tengo preguntas sobre el plan de Eventia",
                    "_blank",
                  )
                }
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm"
              >
                <span>Contactar por WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
