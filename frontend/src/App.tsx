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
import { usePageViews } from "./hooks/usePageViews.ts";

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
const importPersonas = () => import("./pages/personas/PersonasPage");
const importMarketing = () => import("./pages/marketing/MarketingPage");
const importPersonaFicha = () =>
  import("./pages/personas/PersonaFichaPage");
const PersonaFichaPage = lazy(importPersonaFicha);
const importInventario = () => import("./pages/inventario/InventarioPage");
const importServices = () => import("./pages/services");
const importCalendar = () => import("./pages/calendar/Calendar.tsx");

const DashboardPage = lazy(importDashboard);
const RequestsPage = lazy(importRequests);
const QuotationsPage = lazy(importQuotations);
const QuotationForm = lazy(importQuotationForm);
const ClientsPage = lazy(importClients);
const ClientDetailPage = lazy(() => import("./pages/ClientDetailPage"));
// Ficha del negocio (04-08): la página propia de cada cotización.
const NegocioPage = lazy(() => import("./pages/quotations/NegocioPage"));
const PostVentaPage = lazy(importPostVenta);
const LogisticaPage = lazy(importLogistica);
const PersonasPage = lazy(importPersonas);
const MarketingPage = lazy(importMarketing);
const InventarioPage = lazy(importInventario);
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
const ConfirmationPage = lazy(
  () => import("./pages/plans/ConfirmationPage.tsx"),
);
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
  () =>
    import("./pages/customerSatisfactionSurveys/components/TemplateView.tsx"),
);
const AnswersView = lazy(
  () =>
    import("./pages/customerSatisfactionSurveys/components/AnswersView.tsx"),
);

// Lo que se ve el instante entre pedir una pantalla y que llegue.
// PERCEPCIÓN DE CARGA (28-07): antes era un círculo girando y los
// esqueletos de datos eran grises — DOS texturas = el ojo contaba dos
// esperas. Ahora todo el "preparando" es UNA sola textura de esqueleto.
const PageLoader = () => <PageSkeleton />;

function RastreadorDeRutas() {
  usePageViews();
  return null;
}

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
        importPersonas,
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
        {/* Contador por rutas (10-08): estaba escrito pero desenchufado.
            Vive dentro del Router y no dibuja nada. */}
        <RastreadorDeRutas />
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

              {/* Ficha del negocio (04-08): página propia por cotización */}
              <Route
                path="negocio/:id"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.quotations}>
                    <NegocioPage />
                  </PermissionGuard>
                }
              />

              {/* El COTIZADOR pide quotations_edit, no quotations
                  (12-08): recepción ve el tablero y la ficha, pero acá
                  se cambian ítems y descuentos. Si escribe la dirección
                  a mano, la pantalla la rebota. */}
              <Route
                path="quotation-form"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.quotations_edit}>
                    <QuotationForm />
                  </PermissionGuard>
                }
              />

              {/* Edit Quotation Form (with ID) */}
              <Route
                path="quotation-form/:id"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.quotations_edit}>
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
              {/* Ficha del evento como página propia (03-08) */}
              <Route
                path="post-venta/:id"
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

              {/* Inventario (15-08): el mobiliario, separado de Proveedores.
                  Mismo permiso que logística. */}
              <Route
                path="inventario"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.logistics}>
                    <InventarioPage />
                  </PermissionGuard>
                }
              />

              {/* Personas - solo administrador: ahi viven los RUT y las
                  cuentas bancarias de toda la gente que trabaja. */}
              <Route
                path="personas"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.people}>
                    <PersonasPage />
              <Route path="marketing" element={<MarketingPage />} />
                  </PermissionGuard>
                }
              />
              {/* La ficha de una persona vive en su propia dirección
                  (15-08): el formulario dejó de caber en una ventanita
                  y ahora lleva además su calendario. */}
              <Route
                path="personas/:id"
                element={
                  <PermissionGuard allowedRoles={SECTION_ROLES.people}>
                    <PersonaFichaPage />
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
