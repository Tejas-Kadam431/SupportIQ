import { Navigate, Outlet } from "react-router-dom";
import { useAppSelector } from "../app/hooks";

export function ProtectedRoute() {
  const { accessToken, isAuthReady } = useAppSelector((state) => state.auth);

  if (!isAuthReady) {
    return <p style={{ padding: "2rem" }}>Checking session...</p>;
  }

  if (!accessToken) {
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}