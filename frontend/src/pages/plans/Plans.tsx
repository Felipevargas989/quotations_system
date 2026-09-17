import { useState } from "react";
import { ArrowRight, Check, Loader2, Sparkles } from "lucide-react";
import { toast } from "../../components/toast/Toast";
import { useAuth } from "../../contexts/AuthContext";
import { NOMBRE_DEL_PLAN } from "../../constants/permissions";
import {
  PlanContratable,
  pedirEnlaceDePago,
} from "../../services/pagos.service";
import { humanizeApiError } from "../../utils/apiErrors";

// LA PANTALLA DE PLANES (reescrita el 16-09-2026, paso 4 del roadmap).
//
// La versión anterior mostraba UN plan de $10.000 que contradecía a la
// landing y a la tabla de derechos: quedó de una época con precio único.
// Ahora muestra los tres planes firmados el 14-09, con los mismos textos
// y precios que publica la landing (finales, IVA incluido — decisión de
// Felipe del 17-09: números redondos), y marca cuál tiene
// contratado la empresa.
//
// Desde el sprint B (16-09), contratar es de verdad: el motor pide a
// Mercado Pago la suscripción PROPIA de esta empresa (con su id
// adentro — un enlace fijo no sabe quién pagó, plan §2) y el navegador
// viaja al checkout. Si el cobro aún no está configurado en el motor,
// el botón cae con honestidad al WhatsApp de siempre.
//
// Una cortesía (`gratis`, como Valle del Sol) no ve botones de pago:
// no se le cobra, jamás.

type PlanId = "cotiza" | "gestiona" | "crece";

const PLANES: Array<{
  id: PlanId;
  nombre: string;
  para: string;
  precio: string;
  limites: string;
  incluye: string[];
  destacado?: boolean;
}> = [
  {
    id: "cotiza",
    nombre: "Cotiza",
    para: "Para dejar el Excel y vender profesional.",
    precio: "$25.000",
    limites: "Hasta 20 cotizaciones/mes · 1 usuario · eventos de un día",
    incluye: [
      "Cotizador con tu marca y PDF",
      "Catálogo de servicios y precios",
      "Formulario público de solicitud y hoja de cotización en línea",
      "Panel comercial",
    ],
  },
  {
    id: "gestiona",
    nombre: "Gestiona y Cobra",
    para: "Para el que ya vende y necesita cobrar sin perder cuentas.",
    precio: "$60.000",
    limites: "Cotizaciones ilimitadas · 3 usuarios",
    incluye: [
      "Todo lo de Cotiza",
      "Eventos de varios días",
      "Pagos, saldos y semáforo de cobranza",
      "Portal del cliente: saldo y comprobantes",
      "Calendario de eventos",
      "Clientes 360° y múltiples contactos",
      "Panel comercial + de caja",
    ],
    destacado: true,
  },
  {
    id: "crece",
    nombre: "Opera y Crece",
    para: "Para la operación que quiere márgenes y controlarlo todo.",
    precio: "$140.000",
    limites: "Todo ilimitado · equipo completo",
    incluye: [
      "Todo lo de Gestiona y Cobra",
      "Logística: compras, insumos, mobiliario",
      "Recetas, costos y ficha de cocina",
      "Márgenes por evento y por mes",
      "Consultas con brochure automático",
      "Correos automáticos y encuestas",
      "App móvil de terreno",
    ],
  },
];

export default function Plans() {
  const { company } = useAuth();
  const planActual = (company?.plan ?? null) as PlanId | null;
  const enPrueba = company?.estado_plan === "prueba";
  const esCortesia = company?.estado_plan === "gratis";
  const [pidiendo, setPidiendo] = useState<PlanId | null>(null);

  const porWhatsApp = (plan: (typeof PLANES)[number]) => {
    const texto = encodeURIComponent(
      `Hola, quiero contratar el plan ${plan.nombre} de Eventia para ${
        company?.name ?? "mi empresa"
      }.`,
    );
    window.open(
      `https://wa.me/56940589151?text=${texto}`,
      "_blank",
      "noopener",
    );
  };

  const contratar = async (plan: (typeof PLANES)[number]) => {
    if (pidiendo) return;
    setPidiendo(plan.id);
    try {
      const { enlace } = await pedirEnlaceDePago(plan.id as PlanContratable);
      // Misma pestaña, a propósito: Mercado Pago devuelve al cliente a
      // /plans/confirmation por el back_url (plan §3.2, punto 9).
      window.location.assign(enlace);
    } catch (error) {
      const respuesta = (error as { response?: { status?: number } })
        ?.response;
      if (respuesta?.status === 503) {
        // El cobro aún no está encendido en el motor: la venta no se
        // pierde — se conversa, como siempre.
        toast.warn(
          "El pago en línea está por encenderse: te atendemos por WhatsApp",
        );
        porWhatsApp(plan);
      } else {
        toast.error(humanizeApiError(error));
      }
      setPidiendo(null);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Los planes de Eventia
          </h1>
          <p className="text-gray-600">
            {enPrueba
              ? "Estás probando todo Eventia gratis. Elige tu plan y sigue sin cortes."
              : "Cambia de plan cuando quieras: tus datos siempre se conservan."}
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {PLANES.map((plan) => {
            const esElActual = !enPrueba && planActual === plan.id;
            return (
              <div
                key={plan.id}
                className={`relative bg-white rounded-2xl border p-6 flex flex-col ${
                  plan.destacado
                    ? "border-blue-500 shadow-xl"
                    : "border-gray-200 shadow"
                }`}
              >
                {plan.destacado && !esElActual && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs font-semibold px-3 py-1 rounded-full">
                    Más popular
                  </span>
                )}
                {esElActual && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-green-600 text-white text-xs font-semibold px-3 py-1 rounded-full flex items-center gap-1">
                    <Sparkles className="h-3 w-3" /> Tu plan actual
                  </span>
                )}

                <h2 className="text-xl font-bold text-gray-900">
                  {plan.nombre}
                </h2>
                <p className="text-sm text-gray-500 mt-1">{plan.para}</p>

                <div className="mt-4">
                  <span className="text-4xl font-bold text-gray-900">
                    {plan.precio}
                  </span>
                  <span className="text-gray-500 text-sm"> / mes · IVA incluido</span>
                </div>
                <p className="text-xs text-gray-500 mt-1">{plan.limites}</p>

                <ul className="mt-5 space-y-2 flex-1">
                  {plan.incluye.map((linea) => (
                    <li key={linea} className="flex items-start text-sm">
                      <Check className="h-4 w-4 text-green-500 mr-2 mt-0.5 flex-shrink-0" />
                      <span className="text-gray-700">{linea}</span>
                    </li>
                  ))}
                </ul>

                {esCortesia ? (
                  <p className="mt-6 text-center text-sm text-gray-500 py-3">
                    Tu cuenta es una cortesía de la casa: no necesita
                    contratar.
                  </p>
                ) : (
                  <button
                    onClick={() => void contratar(plan)}
                    disabled={esElActual || pidiendo !== null}
                    className={`mt-6 w-full font-semibold py-3 px-4 rounded-xl transition-colors flex items-center justify-center group ${
                      esElActual
                        ? "bg-gray-100 text-gray-400 cursor-default"
                        : plan.destacado
                          ? "bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
                          : "bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-60"
                    }`}
                  >
                    {esElActual ? (
                      "Este es tu plan"
                    ) : pidiendo === plan.id ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Preparando tu pago…
                      </>
                    ) : (
                      <>
                        <span className="mr-2">
                          Contratar {NOMBRE_DEL_PLAN[plan.id]}
                        </span>
                        <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                      </>
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-center text-sm text-gray-500 mt-8">
          Precios finales en pesos chilenos, IVA incluido. Se paga mes a mes con
          Mercado Pago. Bajar de plan no borra nada: lo que quede fuera se
          guarda por si vuelves a subir.
        </p>
      </div>
    </div>
  );
}
