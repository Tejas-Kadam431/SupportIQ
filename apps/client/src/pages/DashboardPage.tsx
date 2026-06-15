import { Link, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { clearCredentials } from "../features/auth/authSlice";
import { useLogoutMutation } from "../features/auth/authApi";

export function DashboardPage() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const [logout, { isLoading }] = useLogoutMutation();

  async function handleLogout() {
    try {
      await logout().unwrap();
    } catch (error) {
      console.error("Logout failed:", error);
    } finally {
      dispatch(clearCredentials());
      navigate("/login");
    }
  }

  return (
    <main style={{ padding: "2rem", fontFamily: "system-ui" }}>
      <h1>SupportIQ Dashboard</h1>
      <p>Welcome, {user?.name}</p>
      <p>This page is protected.</p>

    <nav style={{ display: "flex", gap: "1rem", marginBottom: "1rem" }}>
      <Link to="/organizations">Organizations</Link>
      <Link to="/tickets">Tickets</Link>
    </nav>

      <button onClick={handleLogout} disabled={isLoading}>
        {isLoading ? "Logging out..." : "Logout"}
      </button>
    </main>
  );
}