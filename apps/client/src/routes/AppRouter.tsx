import { Navigate, createBrowserRouter } from "react-router-dom";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { DashboardPage } from "../pages/DashboardPage";
import { ProtectedRoute } from "./ProtectedRoute";
import { OrganizationsPage } from "../features/organizations/OrganizationsPage";
import { MembersPage } from "../features/organizations/MembersPage";
import { TicketsPage } from "../features/tickets/TicketsPage";
import { TicketDetailsPage } from "../features/tickets/TicketDetailsPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />
  },
  {
    path: "/login",
    element: <LoginPage />
  },
  {
    path: "/register",
    element: <RegisterPage />
  },
  {
    element: <ProtectedRoute />,
    children: [
      {
        path: "/dashboard",
        element: <DashboardPage />
      },
      {
        path: "/organizations",
        element: <OrganizationsPage />
      },
      {
        path: "/organizations/:orgId/members",
        element: <MembersPage />
      },
      {
        path: "/tickets",
        element: <TicketsPage />
      },
      {
        path: "/tickets/:ticketId",
        element: <TicketDetailsPage />
      }
    ]
  }
]);