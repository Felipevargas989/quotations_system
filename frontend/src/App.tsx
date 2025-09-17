import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import Layout from "./components/Layout";
import PermissionGuard from "./components/PermissionGuard";
import { SECTION_ROLES } from "./constants/permissions";
import SetupPage from "./pages/SetupPage";
import LoginPage from "./pages/LoginPage.tsx";
import LandingPage from "./pages/landingPage/LandingPage.tsx";
import RegisterPage from "./pages/landingPage/RegisterPage.tsx";
import DashboardPage from "./pages/DashboardPage";
import RequestsPage from "./pages/RequestsPage";
import QuotationsPage from "./pages/QuotationsPage";
import ClientsPage from "./pages/ClientsPage";
import PaymentsPage from "./pages/PaymentsPage";
import UserManagementPage from "./pages/UserManagementPage.tsx";
import SuperAdminPage from "./pages/superAdmin/Index.tsx";
import { ServicesPage } from "./pages/services";

function App() {
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
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/setup" element={<SetupPage />} />
          {/* TODO: add authentication */}
          <Route path="/superAdminqweasdzxc" element={<SuperAdminPage />} />
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
                <PermissionGuard allowedRoles={SECTION_ROLES.payments}>
                  <ServicesPage />
                </PermissionGuard>
              }
            />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;
