import { Navigate, Outlet, useLocation } from "react-router-dom";
import { LoadingState } from "../components/ui/States";
import { useAuth } from "./AuthProvider";
import { hasRole } from "../lib/roles";
import type { UserRole } from "../types/api";

export function ProtectedRoute({ roles }: { roles?: UserRole[] }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingState title="Loading session" description="Checking your access token." />;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  if (roles && !hasRole(user.role, roles)) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return <LoadingState title="Loading session" description="Checking your access token." />;
  }

  if (user) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
