import { Link } from "react-router-dom";
import { useState, useEffect } from "react";
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
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

export default function LandingPage() {
  const [currentSlide, setCurrentSlide] = useState(0);

  const features = [
    {
      icon: <FileText className="h-8 w-8" />,
      title: "Cotizaciones Sencillas",
      description:
        "Crea cotizaciones profesionales para eventos de forma rápida y fácil",
      image: "/images/app-sections/quotations.png",
    },
    {
      icon: <FileText className="h-8 w-8" />,
      title: "Comparte cotizaciones con tus clientes",
      description:
        "Comparte cotizaciones profesionales con tus clientes de forma sencilla",
      image: "/images/app-sections/quotation-pdf.png",
    },
    {
      icon: <ClipboardList className="h-8 w-8" />,
      title: "Seguimiento de Estado",
      description:
        "Trackea el estado de cada cotización desde la solicitud hasta la confirmación",
      image: "/images/app-sections/quotations-status.png",
    },
    {
      icon: <DollarSign className="h-8 w-8" />,
      title: "Control de Pagos",
      description:
        "Mantén registro y seguimiento del estado de todos los pagos de tus eventos",
      image: "/images/app-sections/payments.png",
    },
    {
      icon: <Users className="h-8 w-8" />,
      title: "Gestión de Clientes",
      description:
        "Organiza la información de tus clientes y su historial de eventos",
      image: "/images/app-sections/customers.png",
    },
    {
      icon: <TrendingUp className="h-8 w-8" />,
      title: "Reportes de Negocio",
      description:
        "Visualiza el rendimiento de tu empresa de eventos con métricas claras",
      image: "/images/app-sections/dashboard.png",
    },
    {
      icon: <Shield className="h-8 w-8" />,
      title: "Calendario",
      description: "Visualiza todos tus eventos en un solo lugar",
      image: "/images/app-sections/calendar.png",
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

  // Auto-advance carousel
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % features.length);
    }, 10000); // Change slide every 10 seconds
    return () => clearInterval(timer);
  }, [features.length]);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % features.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + features.length) % features.length);
  };

  const goToSlide = (index: number) => {
    setCurrentSlide(index);
  };

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
                  <span>Agenda demo gratis</span>
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

      {/* Features Carousel Section */}
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

          {/* Carousel Container */}
          <div className="relative max-w-5xl mx-auto">
            {/* Section Selector */}
            <div className="mb-8 overflow-x-auto overflow-y-hidden">
              <div className="flex gap-2 justify-center flex-wrap px-4">
                {features.map((feature, index) => (
                  <button
                    key={index}
                    onClick={() => goToSlide(index)}
                    className={`px-4 py-2 rounded-lg font-medium transition-all duration-300 whitespace-nowrap ${
                      index === currentSlide
                        ? "bg-blue-600 text-white shadow-lg scale-105"
                        : "bg-white text-gray-700 hover:bg-gray-100 border border-gray-300"
                    }`}
                  >
                    {feature.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Main Carousel */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-blue-50 to-purple-50 shadow-2xl">
              <div className="relative h-[500px] md:h-[600px]">
                {features.map((feature, index) => (
                  <div
                    key={index}
                    className={`absolute inset-0 transition-all duration-700 ease-in-out ${
                      index === currentSlide
                        ? "opacity-100 translate-x-0"
                        : index < currentSlide
                          ? "opacity-0 -translate-x-full"
                          : "opacity-0 translate-x-full"
                    }`}
                  >
                    <div className="h-full flex flex-col items-center justify-center p-8 md:p-12">
                      {/* Image */}
                      <div className="w-full max-w-4xl mb-8 rounded-xl overflow-hidden shadow-lg">
                        <img
                          src={feature.image}
                          alt={feature.title}
                          className="w-full h-auto object-cover"
                        />
                      </div>
                      {/* Title and Description */}
                      <div className="text-center max-w-2xl">
                        <h3 className="text-2xl md:text-3xl font-bold text-gray-900 mb-4">
                          {feature.title}
                        </h3>
                        <p className="text-lg text-gray-600">
                          {feature.description}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Navigation Buttons */}
              <button
                onClick={prevSlide}
                className="absolute left-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 p-3 rounded-full shadow-lg transition-all hover:scale-110"
                aria-label="Previous slide"
              >
                <ChevronLeft size={24} />
              </button>
              <button
                onClick={nextSlide}
                className="absolute right-4 top-1/2 -translate-y-1/2 bg-white/90 hover:bg-white text-gray-800 p-3 rounded-full shadow-lg transition-all hover:scale-110"
                aria-label="Next slide"
              >
                <ChevronRight size={24} />
              </button>
            </div>

            {/* Indicators */}
            <div className="flex justify-center gap-2 mt-8">
              {features.map((_, index) => (
                <button
                  key={index}
                  onClick={() => goToSlide(index)}
                  className={`transition-all duration-300 rounded-full ${
                    index === currentSlide
                      ? "bg-blue-600 w-8 h-3"
                      : "bg-gray-300 hover:bg-gray-400 w-3 h-3"
                  }`}
                  aria-label={`Go to slide ${index + 1}`}
                />
              ))}
            </div>
          </div>

          <div className="text-center mt-12">
            <Link
              to="/register"
              className="inline-flex items-center space-x-2 bg-blue-600 text-white px-8 py-4 rounded-lg hover:bg-blue-700 transition-colors text-lg font-semibold"
            >
              <span>Agenda demo gratis</span>
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
                  <span>Agenda demo gratis</span>
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
                <span>Agenda demo gratis</span>
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
            <span>Agenda demo gratis</span>
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
