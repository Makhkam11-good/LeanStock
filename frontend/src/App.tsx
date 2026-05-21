import { Navigate, Route, Routes } from "react-router-dom";
import { AppLayout } from "./components/layout/AppLayout";
import { ProtectedRoute, PublicOnlyRoute } from "./auth/ProtectedRoute";
import { LoginPage } from "./pages/auth/LoginPage";
import { SignupPage } from "./pages/auth/SignupPage";
import { VerifyEmailPage } from "./pages/auth/VerifyEmailPage";
import { ForgotPasswordPage } from "./pages/auth/ForgotPasswordPage";
import { ResetPasswordPage } from "./pages/auth/ResetPasswordPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CompaniesPage } from "./pages/CompaniesPage";
import { UsersPage } from "./pages/UsersPage";
import { RolesPage } from "./pages/RolesPage";
import { WarehousesPage } from "./pages/WarehousesPage";
import { ProductsPage } from "./pages/ProductsPage";
import { InventoryPage } from "./pages/InventoryPage";
import { MovementsPage } from "./pages/MovementsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ProfilePage } from "./pages/ProfilePage";
import { OrdersPage } from "./pages/OrdersPage";

export default function App() {
  return (
    <Routes>
      <Route element={<PublicOnlyRoute />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />
      </Route>

      <Route path="/verify-email" element={<VerifyEmailPage />} />

      <Route element={<ProtectedRoute />}>
        <Route element={<AppLayout />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route element={<ProtectedRoute roles={["SYSTEM_ADMIN"]} />}>
            <Route path="/companies" element={<CompaniesPage />} />
          </Route>
          <Route element={<ProtectedRoute roles={["SYSTEM_ADMIN", "COMPANY_ADMIN"]} />}>
            <Route path="/users" element={<UsersPage />} />
          </Route>
          <Route path="/roles" element={<RolesPage />} />
          <Route path="/warehouses" element={<WarehousesPage />} />
          <Route path="/products" element={<ProductsPage />} />
          <Route path="/inventory" element={<InventoryPage />} />
          <Route element={<ProtectedRoute roles={["SYSTEM_ADMIN", "COMPANY_ADMIN", "MANAGER", "WAREHOUSE_OPERATOR"]} />}>
            <Route path="/movements" element={<MovementsPage />} />
          </Route>
          <Route path="/orders" element={<OrdersPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/profile" element={<ProfilePage />} />
        </Route>
      </Route>

      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
