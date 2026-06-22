import { Navigate, createBrowserRouter } from "react-router-dom";
import { LoginPage } from "../features/auth/LoginPage";
import { RegisterPage } from "../features/auth/RegisterPage";
import { DashboardPage } from "../pages/DashboardPage";
import { ProtectedRoute } from "./ProtectedRoute";
import { OrganizationsPage } from "../features/organizations/OrganizationsPage";
import { MembersPage } from "../features/organizations/MembersPage";
import { TicketsPage } from "../features/tickets/TicketsPage";
import { TicketDetailsPage } from "../features/tickets/TicketDetailsPage";
import { CreateTicketPage } from "../features/tickets/CreateTicketPage";
import { KnowledgeBasePage } from "../features/knowledge-base/KnowledgeBasePage";
import { AppLayout } from "../components/AppLayout";
import { ErrorPage } from "../components/ErrorPage";
import { NotFoundPage } from "../components/NotFoundPage";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <Navigate to="/dashboard" replace />,
    errorElement: <ErrorPage />
  },
  {
    path: "/login",
    element: <LoginPage />,
    errorElement: <ErrorPage />
  },
  {
    path: "/register",
    element: <RegisterPage />,
    errorElement: <ErrorPage />
  },
  {
    element: <ProtectedRoute />,
    errorElement: <ErrorPage />,
    children: [
      {
        element: <AppLayout />,
        children: [
          {
            path: "dashboard",
            element: <DashboardPage />
          },
          {
            path: "organizations",
            element: <OrganizationsPage />
          },
          {
            path: "organizations/:orgId/members",
            element: <MembersPage />
          },
          {
            path: "tickets",
            element: <TicketsPage />
          },
          {
            path: "tickets/new",
            element: <CreateTicketPage />
          },
          {
            path: "tickets/:ticketId",
            element: <TicketDetailsPage />
          },
          {
            path: "knowledge-base",
            element: <KnowledgeBasePage />
          }
        ]
      }
    ]
  },
  {
    path: "*",
    element: <NotFoundPage />
  }
]);