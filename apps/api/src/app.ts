import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { errorHandler } from "./common/errors/errorHandler.js";
import { orgRoutes } from "./modules/organizations/org.routes.js";
import { ticketRoutes } from "./modules/tickets/ticket.routes.js";

export const app = express();

app.use(helmet());

app.use(
  cors({
    origin: "http://localhost:5173",
    credentials: true
  })
);

app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "supportiq-api"
  });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/organizations", orgRoutes);
app.use("/api/v1/organizations/:orgId/tickets", ticketRoutes);
app.use((_req, res) => {
  res.status(404).json({
    message: "Route not found"
  });
});

app.use(errorHandler);