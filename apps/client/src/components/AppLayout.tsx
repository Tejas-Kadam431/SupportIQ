import { NavLink, Outlet } from "react-router-dom";
import { useAppSelector } from "../app/hooks";
import "./appLayout.css";

const navItems = [
  {
    to: "/dashboard",
    label: "Dashboard"
  },
  {
    to: "/organizations",
    label: "Organizations"
  },
  {
    to: "/tickets",
    label: "Tickets"
  },
  {
    to: "/tickets/new",
    label: "Create Ticket"
  },
  {
    to: "/knowledge-base",
    label: "Knowledge Base"
  }
];

export function AppLayout() {
  const user = useAppSelector((state) => state.auth.user);

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
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="app-main-area">
        <header className="app-topbar">
          <div>
            <strong>{user?.name ?? "Support User"}</strong>
            <p>{user?.email ?? "Logged in"}</p>
          </div>
        </header>

        <div className="app-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}