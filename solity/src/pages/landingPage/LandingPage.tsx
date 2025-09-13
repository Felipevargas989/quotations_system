import { Link } from "react-router-dom";
import {
  Building,
  FileText,
  DollarSign,
  Users,
  ClipboardList,
  TrendingUp,
  Shield,
  ArrowRight,
  CheckCircle,
  Star,
} from "lucide-react";

export default function LandingPage() {
  const features = [
    {
      icon: <FileText className="h-8 w-8" />,
      title: "Cotizaciones Sencillas",
      description:
        "Crea cotizaciones profesionales para eventos de forma rápida y fácil",
    },
    {
      icon: <ClipboardList className="h-8 w-8" />,
      title: "Seguimiento de Estado",
      description:
        "Trackea el estado de cada cotización desde la solicitud hasta la confirmación",
    },
    {
      icon: <DollarSign className="h-8 w-8" />,
      title: "Control de Pagos",
      description:
        "Mantén registro y seguimiento del estado de todos los pagos de tus eventos",
    },
    {
      icon: <Users className="h-8 w-8" />,
      title: "Gestión de Clientes",
      description:
        "Organiza la información de tus clientes y su historial de eventos",
    },
    {
      icon: <TrendingUp className="h-8 w-8" />,
      title: "Reportes de Negocio",
      description:
        "Visualiza el rendimiento de tu empresa de eventos con métricas claras",
    },
    {
      icon: <Shield className="h-8 w-8" />,
      title: "Acceso Seguro",
      description:
        "Sistema de permisos para que tu equipo acceda solo a lo que necesita",
    },
  ];

  const benefits = [
    "Simplifica la creación de cotizaciones para eventos",
    "Mantén control total del estado de cada proyecto",
    "Gestiona pagos y cobros de manera eficiente",
    "Mejora la comunicación con tus clientes",
    "Reduce errores y duplicación de trabajo",
    "Accede a tu información desde cualquier lugar",
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center">
              <img
                src="/images/logo.png"
                alt="Valle del Sol Quillón"
                className="h-18 w-32 rounded"
              />
            </div>
            <div className="flex items-center space-x-4">
              <Link
                to="/login"
                className="bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition-colors flex items-center space-x-2"
              >
                <span>Acceder</span>
                <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div className="text-center lg:text-left">
              <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-6">
                Cotiza, gestiona y cobra,{" "}
                <span className="text-blue-600">sin perder un detalle</span>
              </h1>
              <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto lg:mx-0">
                La plataforma especializada para empresas que realicen eventos.
                Crea cotizaciones, seguimiento de estados y gestiona pagos de
                forma sencilla y profesional.
              </p>
              <div className="flex justify-center lg:justify-start">
                <Link
                  to="/register"
                  className="bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition-colors text-lg font-semibold flex items-center justify-center space-x-2"
                >
                  <span>Solicitar Demo</span>
                  <ArrowRight size={20} />
                </Link>
              </div>
            </div>

            <div className="flex justify-center lg:justify-end">
              <div className="relative">
                <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 rounded-2xl transform rotate-3"></div>
                <img
                  src="/images/app.png"
                  alt="Eventia - Plataforma de Gestión de Eventos"
                  className="relative rounded-2xl shadow-2xl border border-gray-200 max-w-full h-auto"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Todo lo que necesitas para tus eventos
            </h2>
            <p className="text-xl text-gray-600 max-w-2xl mx-auto">
              Eventia combina las herramientas esenciales para el éxito de tu
              empresa que realiza eventos
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {features.map((feature, index) => (
              <div
                key={index}
                className="bg-gray-50 p-8 rounded-xl hover:shadow-lg transition-shadow"
              >
                <div className="text-blue-600 mb-4">{feature.icon}</div>
                <h3 className="text-xl font-semibold text-gray-900 mb-3">
                  {feature.title}
                </h3>
                <p className="text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Link
              to="/register"
              className="inline-flex items-center space-x-2 bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition-colors text-lg font-semibold"
            >
              <span>Solicitar Demo</span>
              <ArrowRight size={20} />
            </Link>
          </div>
        </div>
      </section>

      {/* Benefits Section */}
      <section className="py-20 bg-gradient-to-r from-blue-600 to-purple-600">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <h2 className="text-3xl md:text-4xl font-bold text-white mb-6">
                ¿Por qué elegir Eventia?
              </h2>
              <p className="text-xl text-blue-100 mb-8">
                Nuestra plataforma está diseñada específicamente para empresas
                que realicen eventos, simplificando la gestión de cotizaciones,
                seguimiento y pagos.
              </p>
              <div className="space-y-4">
                {benefits.map((benefit, index) => (
                  <div key={index} className="flex items-center space-x-3">
                    <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0" />
                    <span className="text-white">{benefit}</span>
                  </div>
                ))}
              </div>

              <div className="mt-8">
                <Link
                  to="/register"
                  className="inline-flex items-center space-x-2 bg-white text-blue-600 px-6 py-3 rounded-lg hover:bg-gray-100 transition-colors font-semibold"
                >
                  <span>Solicitar Demo</span>
                  <ArrowRight size={18} />
                </Link>
              </div>
            </div>
            <div className="bg-white/10 backdrop-blur-sm p-8 rounded-xl border border-white/20">
              <div className="text-center">
                <div className="inline-flex items-center space-x-2 bg-green-500/20 text-green-300 px-4 py-2 rounded-full text-sm font-medium mb-4">
                  <span>✓</span>
                  <span>Caso de Éxito</span>
                </div>
                <Building className="h-16 w-16 text-white mx-auto mb-4" />
                <h3 className="text-2xl font-bold text-white mb-3">
                  Valle del Sol Quillón
                </h3>
                <p className="text-blue-100 mb-6 text-lg">
                  Empresa líder en eventos que optimizó su gestión de
                  cotizaciones y pagos con Eventia
                </p>
                <div className="grid grid-cols-2 gap-6 text-center">
                  <div className="bg-white/5 p-4 rounded-lg">
                    <div className="text-3xl font-bold text-white mb-1">
                      300+
                    </div>
                    <div className="text-blue-100 text-sm">
                      Cotizaciones Generadas
                    </div>
                  </div>
                  <div className="bg-white/5 p-4 rounded-lg">
                    <div className="text-3xl font-bold text-white mb-1">
                      20MM+
                    </div>
                    <div className="text-blue-100 text-sm">
                      CLP en Pagos Gestionados
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section className="py-20 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
              Plan Simple y Transparente
            </h2>
            <p className="text-xl text-gray-600">
              Un solo plan con todo lo que necesitas para gestionar tus eventos
            </p>
          </div>

          <div className="max-w-md mx-auto">
            <div className="bg-gradient-to-br from-blue-50 to-purple-50 border-2 border-blue-200 rounded-2xl p-8 shadow-lg">
              <div className="text-center mb-8">
                <h3 className="text-2xl font-bold text-gray-900 mb-2">
                  Plan Profesional
                </h3>
                <p className="text-gray-600">
                  Ideal para empresas que realicen eventos (Sector hotelero,
                  centro de eventos, etc.)
                </p>
              </div>

              <div className="text-center mb-8">
                <div className="flex items-baseline justify-center">
                  <span className="text-4xl font-bold text-gray-900">$10</span>
                  <span className="text-xl text-gray-600 ml-2">USD</span>
                </div>
                <p className="text-gray-600">por mes</p>
                <div className="mt-2">
                  <span className="text-2xl text-red-500 line-through font-bold">
                    $15 USD
                  </span>
                  <span className="text-sm text-green-600 ml-2 font-medium">
                    6 primeros meses a $10, luego $15 USD mensual
                  </span>
                </div>
                <div className="mt-1">
                  <span className="text-xs bg-green-100 text-green-800 px-2 py-1 rounded-full font-medium">
                    Promoción de lanzamiento
                  </span>
                </div>
              </div>

              <div className="space-y-4 mb-8">
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span className="text-gray-700">Cotizaciones ilimitadas</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span className="text-gray-700">Seguimiento de estados</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span className="text-gray-700">Gestión de pagos</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span className="text-gray-700">Base de clientes</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span className="text-gray-700">Reportes y métricas</span>
                </div>
                <div className="flex items-center space-x-3">
                  <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                  <span className="text-gray-700">Soporte por email</span>
                </div>
              </div>

              <Link
                to="/register"
                className="w-full bg-blue-600 text-white py-3 px-6 rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center space-x-2"
              >
                <span>Solicitar Demo</span>
                <ArrowRight size={18} />
              </Link>

              <p className="text-center text-sm text-gray-500 mt-4">
                Sin contratos largos • Cancela cuando quieras
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-6">
            ¿Listo para optimizar tus eventos?
          </h2>
          <p className="text-xl text-gray-600 mb-8">
            Únete a a las empresas que ya confían en Eventia para gestionar sus
            eventos
          </p>
          <Link
            to="/register"
            className="inline-flex items-center space-x-2 bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition-colors text-lg font-semibold"
          >
            <span>Solicitar Demo</span>
            <ArrowRight size={20} />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <div className="flex items-center space-x-3 mb-4">
                {/* <img src="/images/logo.png" alt="Valle del Sol Quillón" className="h-18 w-32 rounded" /> */}
                <h3 className="text-lg font-bold">Eventia</h3>
              </div>
              <p className="text-gray-400">
                Sistema especializado en gestión de eventos para optimizar tus
                cotizaciones y pagos.
              </p>
            </div>
            <div>
              <h4 className="text-lg font-semibold mb-4">Características</h4>
              <ul className="space-y-2 text-gray-400">
                <li>Cotizaciones de Eventos</li>
                <li>Seguimiento de Estados</li>
                <li>Control de Pagos</li>
                <li>Gestión de Clientes</li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
            <p>&copy; 2025 Eventia. Todos los derechos reservados.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
