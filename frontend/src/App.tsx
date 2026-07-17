import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./layout/Layout.tsx";
import PermissionGuard from "./components/PermissionGuard";
import { SECTION_ROLES } from "./constants/permissions";
import LoginPage from "./pages/LoginPage.tsx";
import LandingPage from "./pages/landingPage/LandingPage.tsx";
import RegisterPage from "./pages/landingPage/RegisterPage.tsx";
import DashboardPage from "./pages/dashboard/DashboardPage.tsx";
import RequestsPage from "./pages/RequestsPage";
import QuotationsPage from "./pages/quotations/QuotationsPage";
import QuotationForm from "./pages/quotations/QuotationForm";
import ClientsPage from "./pages/ClientsPage";
import PaymentsPage from "./pages/PaymentsPage";
import PostVentaPage from "./pages/postventa/PostVentaPage";
import UserManagementPage from "./pages/UserManagementPage.tsx";
import SuperAdminPage from "./pages/superAdmin/Index.tsx";
import { ServicesPage } from "./pages/services";
import ConfigurationPage from "./pages/configuration/ConfigurationPage";
import CompanyConfiguration from "./pages/configuration/companyConfiguration/CompanyConfiguration.tsx";
import Calendar from "./pages/calendar/Calendar.tsx";
import { useEffect } from "react";
import { initGA } from "./lib/analytics.ts";
import Plans from "./pages/plans/Plans.tsx";
import ConfirmationPage from "./pages/plans/ConfirmationPage.tsx";
import CreateQuotationPublic from "./pages/quotations/CreateQuotationPublic.tsx";
import Analytics from "./pages/analytics/index.tsx";
import CustomerSatisfactionSurveyPublicPage from "./pages/customerSatisfactionSurveys/PublicSurvey.tsx";
import CustomerSatisfactionSurveysPage from "./pages/customerSatisfactionSurveys/index.tsx";
import TemplateView from "./pages/customerSatisfactionSurveys/components/TemplateView.tsx";
import AnswersView from "./pages/customerSatisfactionSurveys/components/AnswersView.tsx";
import ForgotPasswordPage from "./pages/auth/ForgotPasswordPage.tsx";
import ResetPasswordPage from "./pages/auth/ResetPasswordPage.tsx";

function App() {
  // Initialize Google Analytics
  useEffect(() => {
    initGA();
  }, []);

  // usePageViews();

  // TODO: check if this is needed
  // useEffect(() => {
  //   // Check for overdue payments on app startup
  //   // checkAndUpdateOverduePayments();
  // }, []);

  return (
    <AuthProvider>
      <Router>
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

            {/* Payments - Operaciones, Admin */}
            <Route
              path="payments"
              element={
                <PermissionGuard allowedRoles={SECTION_ROLES.payments}>
                  <PaymentsPage />
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

            {/* analytics */}
            <Route
              path="analytics"
              element={
                <PermissionGuard allowedRoles={SECTION_ROLES.analytics}>
                  <Analytics />
                </PermissionGuard>
              }
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
      </Router>
    </AuthProvider>
  );
}

export default App;
