import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAppDispatch, useAppSelector } from "../app/hooks";
import { api } from "../app/api";
import { useLogoutMutation } from "../features/auth/authApi";
import { clearCredentials } from "../features/auth/authSlice";
import { disconnectSocket } from "../features/realtime/socketClient";
import "./appLayout.css";

const navItems = [
  {
    to: "/dashboard",
    label: "Dashboard",
    icon: "⌂"
  },
  {
    to: "/organizations",
    label: "Organizations",
    icon: "▦"
  },
  {
    to: "/tickets",
    label: "Tickets",
    icon: "□"
  },
  {
    to: "/tickets/new",
    label: "Create Ticket",
    icon: "+"
  },
  {
    to: "/knowledge-base",
    label: "Knowledge Base",
    icon: "◫"
  }
];

export function AppLayout() {
  const navigate = useNavigate();
  const dispatch = useAppDispatch();
  const user = useAppSelector((state) => state.auth.user);
  const [logout, { isLoading: isLoggingOut }] = useLogoutMutation();

  async function handleLogout() {
    try {
      await logout().unwrap();
    } catch (error) {
      console.error("Logout request failed:", error);
    } finally {
      disconnectSocket();
      dispatch(clearCredentials());
      dispatch(api.util.resetApiState());
      navigate("/login", { replace: true });
    }
  }

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-brand">
          <div className="app-brand-mark">S</div>
          <div>
            <h1>SupportIQ</h1>
            <p>AI Support Desk</p>
          </div>
        </div>

        <nav className="app-nav">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                isActive ? "app-nav-link app-nav-link-active" : "app-nav-link"
              }
            >
              <span className="app-nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="app-copilot-card">
          <div className="app-copilot-header">
            <strong>AI Drafts</strong>
            <span>Live</span>
          </div>
          <p>
            Generate source-grounded AI replies directly from ticket details.
          </p>
          <button type="button" onClick={() => navigate("/tickets")}>
            Open Tickets
          </button>
        </div>
      </aside>

      <div className="app-main-area">
        <header className="app-topbar">
          <div>
            <strong className="app-topbar-title">Support Workspace</strong>
            <p className="app-topbar-subtitle">
              Manage tickets, knowledge base, AI replies, and support activity.
            </p>
          </div>

          <div className="app-topbar-actions">
            <div className="app-user-avatar">
              {(user?.name?.[0] ?? "U").toUpperCase()}
            </div>

            <div className="app-user-summary">
              <strong>{user?.name ?? "Support User"}</strong>
              <p>{user?.email ?? "Admin"}</p>
            </div>

            <button
              type="button"
              className="app-logout-button"
              onClick={handleLogout}
              disabled={isLoggingOut}
            >
              {isLoggingOut ? "Logging out..." : "Logout"}
            </button>
          </div>
        </header>

        <main className="app-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}