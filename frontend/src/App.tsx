import { lazy, Suspense, useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
} from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { ToastHost } from "./components/toast/Toast";
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
import PageSkeleton from "./components/PageSkeleton";
import LandingPage from "./pages/landingPage/LandingPage.tsx";
import LoginPage from "./pages/LoginPage.tsx";
import RegisterPage from "./pages/landingPage/RegisterPage.tsx";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage.tsx";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage.tsx";

// PERCEPCIÓN DE CARGA (28-07): las piezas más usadas se PRECARGAN en
// segundo plano apenas la app abre (ver useEffect en App) — así el
// "Cargando..." entre pantallas casi nunca aparece. Los import quedan
// en funciones nombradas para poder dispararlos anticipadamente.
const importDashboard = () => import("./pages/dashboard/DashboardPage.tsx");
const importRequests = () => import("./pages/RequestsPage");
const importQuotations = () => import("./pages/quotations/QuotationsPage");
const importQuotationForm = () => import("./pages/quotations/QuotationForm");
const importClients = () => import("./pages/ClientsPage");
const importPostVenta = () => import("./pages/postventa/PostVentaPage");
const importLogistica = () => import("./pages/logistica/LogisticaPage");
const importServices = () => import("./pages/services");
const importCalendar = () => import("./pages/calendar/Calendar.tsx");

const DashboardPage = lazy(importDashboard);
const RequestsPage = lazy(importRequests);
const QuotationsPage = lazy(importQuotations);
const QuotationForm = lazy(importQuotationForm);
const ClientsPage = lazy(importClients);
const ClientDetailPage = lazy(() => import("./pages/ClientDetailPage"));
const PostVentaPage = lazy(importPostVenta);
const LogisticaPage = lazy(importLogistica);
const UserManagementPage = lazy(() => import("./pages/UserManagementPage.tsx"));
const SuperAdminPage = lazy(() => import("./pages/superAdmin/Index.tsx"));
const ServicesPage = lazy(() =>
  importServices().then((m) => ({ default: m.ServicesPage })),
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
const Calendar = lazy(importCalendar);
const Plans = lazy(() => import("./pages/plans/Plans.tsx"));
const ConfirmationPage = lazy(() => import("./pages/plans/ConfirmationPage.tsx"));
const CreateQuotationPublic = lazy(
  () => import("./pages/quotations/CreateQuotationPublic.tsx"),
);
const CustomerSatisfactionSurveyPublicPage = lazy(
  () => import("./pages/customerSatisfactionSurveys/PublicSurvey.tsx"),
);
// Portal del cliente (Fase 2a): página pública por enlace secreto.
const PortalPage = lazy(() => import("./pages/portal/PortalPage.tsx"));
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
// PERCEPCIÓN DE CARGA (28-07): antes era un círculo girando y los
// esqueletos de datos eran grises — DOS texturas = el ojo contaba dos
// esperas. Ahora todo el "preparando" es UNA sola textura de esqueleto.
const PageLoader = () => <PageSkeleton />;

function App() {
  // Initialize Google Analytics
  useEffect(() => {
    initGA();
  }, []);

  // PERCEPCIÓN DE CARGA (28-07): precarga silenciosa de las pantallas
  // más usadas cuando el navegador está desocupado — navegar después
  // es instantáneo (la pieza ya está). Si algo falla, no pasa nada:
  // la pantalla se descarga normal al visitarla.
  useEffect(() => {
    const precargar = () => {
      [
        importDashboard,
        importQuotations,
        importPostVenta,
        importLogistica,
        importClients,
        importQuotationForm,
        importServices,
        importCalendar,
        importRequests,
      ].forEach((imp) => {
        imp().catch(() => {});
      });
    };
    const t = window.setTimeout(precargar, 2500);
    return () => window.clearTimeout(t);
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

            {/* Portal del cliente (enlace secreto, sin clave) */}
            <Route path="/portal/:token" element={<PortalPage />} />

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
        {/* Toasts de la casa (Tanda 0): un solo anfitrión para toda la
            app, incluidas las pantallas públicas. */}
        <ToastHost />
      </Router>
    </AuthProvider>
  );
}

export default App;
