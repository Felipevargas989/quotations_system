import { lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./layout/Layout.tsx";
import PermissionGuard from "./components/PermissionGuard";
import { SECTION_ROLES } from "./constants/permissions";
import { initGA } from "./lib/analytics.ts";

// CARGA POR PARTES (Fase 3, 28-07). Antes TODAS las pantallas viajaban
// en un solo archivo de 1,7 MB que el navegador descargaba entero al
// entrar, aunque el usuario solo mirara la portada. Ahora:
//
//  - Lo que se ve primero (landing, login, recuperar contraseña) va en
//    el paquete inicial, para que la primera pintura sea inmediata.
//  - Cada pantalla del sistema se descarga LA PRIMERA VEZ que se
//    visita (lazy). Las visitas siguientes salen del caché.
//
// Regla para pantallas nuevas: si vive detrás del login, va lazy.
import LandingPage from "./pages/landingPage/LandingPage.tsx";
import LoginPage from "./pages/LoginPage.tsx";
import RegisterPage from "./pages/landingPage/RegisterPage.tsx";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage.tsx";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage.tsx";

const DashboardPage = lazy(() => import("./pages/dashboard/DashboardPage.tsx"));
const RequestsPage = lazy(() => import("./pages/RequestsPage"));
const QuotationsPage = lazy(() => import("./pages/quotations/QuotationsPage"));
const QuotationForm = lazy(() => import("./pages/quotations/QuotationForm"));
const ClientsPage = lazy(() => import("./pages/ClientsPage"));
const ClientDetailPage = lazy(() => import("./pages/ClientDetailPage"));
const PostVentaPage = lazy(() => import("./pages/postventa/PostVentaPage"));
const LogisticaPage = lazy(() => import("./pages/logistica/LogisticaPage"));
const UserManagementPage = lazy(() => import("./pages/UserManagementPage.tsx"));
const SuperAdminPage = lazy(() => import("./pages/superAdmin/Index.tsx"));
const ServicesPage = lazy(() =>
  import("./pages/services").then((m) => ({ default: m.ServicesPage })),
);
const ConfigurationPage = lazy(
  () => import("./pages/configuration/ConfigurationPage"),
);
const CompanyConfiguration = lazy(
  () =>
    import(
      "./pages/configuration/companyConfiguration/CompanyConfiguration.tsx"
    ),
);
const Calendar = lazy(() => import("./pages/calendar/Calendar.tsx"));
const Plans = lazy(() => import("./pages/plans/Plans.tsx"));
const ConfirmationPage = lazy(() => import("./pages/plans/ConfirmationPage.tsx"));
const CreateQuotationPublic = lazy(
  () => import("./pages/quotations/CreateQuotationPublic.tsx"),
);
const CustomerSatisfactionSurveyPublicPage = lazy(
  () => import("./pages/customerSatisfactionSurveys/PublicSurvey.tsx"),
);
const CustomerSatisfactionSurveysPage = lazy(
  () => import("./pages/customerSatisfactionSurveys/index.tsx"),
);
const TemplateView = lazy(
  () => import("./pages/customerSatisfactionSurveys/components/TemplateView.tsx"),
);
const AnswersView = lazy(
  () => import("./pages/customerSatisfactionSurveys/components/AnswersView.tsx"),
);

// Lo que se ve el instante entre pedir una pantalla y que llegue.
// Mismo lenguaje visual que PermissionGuard.
const PageLoader = () => (
  <div className="min-h-screen bg-gray-50 flex items-center justify-center">
    <div className="text-center">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
      <p className="text-gray-600">Cargando...</p>
    </div>
  </div>
);

function App() {
  // Initialize Google Analytics
  useEffect(() => {
    initGA();
  }, []);

  return (
    <AuthProvider>
      <Router>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/" element={<LandingPage />} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/forgot-password" element={<ForgotPasswordPage />} />
            <Route path="/reset-password" element={<ResetPasswordPage />} />
            <Route path="/register" element={<RegisterPage />} />
            {/* TODO: add authentication */}
            <Route path="/superAdminqweasdzxc" element={<SuperAdminPage />} />
            <Route
              path="/public-quotation/:company_id"
              element={<CreateQuotationPublic />}
            />

            {/* Customer Satisfaction Survey */}
            <Route
              path="/customer-satisfaction-survey/:companyId/:quotationId"
              element={<CustomerSatisfactionSurveyPublicPage />}
            />

            <Route path="/" element={<Layout />}>
              {/* Dashboard - Admin only */}
              <Route
                path="dashboard"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.dashboard}>
                    <DashboardPage />
                  </PermissionGuard>
                }
              />

              {/* Requests - All roles */}
              <Route
                path="requests"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.requests}>
                    <RequestsPage />
                  </PermissionGuard>
                }
              />

              {/* Quotations - Vendedor, Operaciones, Admin */}
              <Route
                path="quotations"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.quotations}>
                    <QuotationsPage />
                  </PermissionGuard>
                }
              />

              {/* New Quotation Form (no ID) */}
              <Route
                path="quotation-form"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.quotations}>
                    <QuotationForm />
                  </PermissionGuard>
                }
              />

              {/* Edit Quotation Form (with ID) */}
              <Route
                path="quotation-form/:id"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.quotations}>
                    <QuotationForm />
                  </PermissionGuard>
                }
              />

              {/* Clients - All roles */}
              <Route
                path="clients"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.clients}>
                    <ClientsPage />
                  </PermissionGuard>
                }
              />

              {/* Ficha 360° del cliente (Clientes 2.0) */}
              <Route
                path="clients/:id"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.clients}>
                    <ClientDetailPage />
                  </PermissionGuard>
                }
              />

              {/* Post-Venta (nueva vista de pagos centrada en el evento) */}
              <Route
                path="post-venta"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.payments}>
                    <PostVentaPage />
                  </PermissionGuard>
                }
              />

              {/* User Management - Admin only */}
              <Route
                path="admin/users"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.user_management}>
                    <UserManagementPage />
                  </PermissionGuard>
                }
              />

              {/* Services - Admin */}
              <Route
                path="services"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.services}>
                    <ServicesPage />
                  </PermissionGuard>
                }
              />

              {/* Logística - Operaciones, Admin */}
              <Route
                path="logistica"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.logistics}>
                    <LogisticaPage />
                  </PermissionGuard>
                }
              />

              {/* Configuration - All roles */}
              <Route
                path="configuration"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.configuration}>
                    <ConfigurationPage />
                  </PermissionGuard>
                }
              />
              <Route
                path="company-configuration"
                element={
                  <PermissionGuard
                    allowedRoles={SECTION_ROLES.company_configuration}
                  >
                    <CompanyConfiguration />
                  </PermissionGuard>
                }
              />
              <Route
                path="calendar"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.calendar}>
                    <Calendar />
                  </PermissionGuard>
                }
              />

              {/* plans */}
              <Route
                path="plans"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.plans}>
                    <Plans />
                  </PermissionGuard>
                }
              />

              {/* confirm plan */}
              <Route
                path="plans/confirmation"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.plans}>
                    <ConfirmationPage />
                  </PermissionGuard>
                }
              />

              {/* analytics vive ahora dentro del Dashboard (Fase 2,
                  23-07); la ruta vieja redirige para no romper marcadores */}
              <Route
                path="analytics"
                element={<Navigate to="/dashboard" replace />}
              />

              {/* customer satisfaction survey */}
              <Route
                path="customer-satisfaction-survey"
                element={<CustomerSatisfactionSurveysPage />}
              />
              <Route
                path="customer-satisfaction-survey/template"
                element={<TemplateView />}
              />
              <Route
                path="customer-satisfaction-survey/answers"
                element={<AnswersView />}
              />
            </Route>
          </Routes>
        </Suspense>
      </Router>
    </AuthProvider>
  );
}

export default App;
