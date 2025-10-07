import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import NewUserRegisterForm from "./NewUserRegisterForm";

export default function RegisterPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center space-x-4">
              <Link
                to="/"
                className="flex items-center space-x-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft size={20} />
                <span>Volver al inicio</span>
              </Link>
            </div>
            <div className="flex items-center">
              <h1 className="text-xl font-bold text-gray-900">Eventia</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-4xl mx-auto">
          {/* Page Header */}
          <div className="text-center mb-12">
            <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-6">
              Crea tu cuenta en Eventia
            </h1>
            <h3 className="text-xl text-gray-700 max-w-2xl mx-auto">
              Comienza ahora con un{" "}
              <span className="bg-gradient-to-r from-blue-600 to-purple-600 text-white px-3 py-1 rounded-lg font-bold">
                periodo de prueba gratuito de 7 días
              </span>
              <p className="text-gray-700 text-sm mt-3">
                {" "}
                Sin tarjeta de crédito requerida
              </p>
            </h3>
          </div>

          {/* Form Section */}
          <div className="max-w-2xl mx-auto">
            <NewUserRegisterForm />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-200 py-8 mt-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <p className="text-gray-500">
            &copy; 2025 Eventia. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}
