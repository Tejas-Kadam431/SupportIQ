import { reliabilityRoutes } from "./modules/reliability/replay.routes.js";
import { qualityRoutes } from "./modules/knowledge-issues/quality.routes.js";
import express from "express";
import cors from "cors";
import { requestContext } from "./common/operations.js";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { authRoutes } from "./modules/auth/auth.routes.js";
import { errorHandler } from "./common/errors/errorHandler.js";
import { orgRoutes } from "./modules/organizations/org.routes.js";
import { orgTicketRoutes, ticketRoutes } from "./modules/tickets/ticket.routes.js";
import { messageRoutes } from "./modules/messages/message.routes.js";
import { noteRoutes } from "./modules/notes/note.routes.js";
import { kbRoutes } from "./modules/knowledge-base/kb.routes.js";
import { aiRoutes } from "./modules/ai/ai.routes.js";
import { activityRoutes } from "./modules/activity/activity.routes.js";
import { dashboardRoutes } from "./modules/dashboard/dashboard.routes.js";
import { healthRoutes } from "./modules/health/health.routes.js";
import { isAllowedOrigin } from "./config/origins.js";
export const app = express();
app.set("trust proxy", 1);
app.use(requestContext);
app.use(cors({
    origin(origin, callback) {
        if (isAllowedOrigin(origin)) {
            callback(null, true);
            return;
        }
        callback(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true
}));
app.use(helmet({
    crossOriginResourcePolicy: {
        policy: "cross-origin"
    }
}));
app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false
}));
app.use(express.json());
app.use(cookieParser());
app.use("/health", healthRoutes);
app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/organizations", orgRoutes);
app.use("/api/v1/organizations/:orgId/dashboard", dashboardRoutes);
app.use("/api/v1/organizations/:orgId/quality", qualityRoutes);
app.use("/api/v1/organizations/:orgId/reliability", reliabilityRoutes);
app.use("/api/v1/organizations/:orgId/tickets", orgTicketRoutes);
app.use("/api/v1/tickets", ticketRoutes);
app.use("/api/v1/tickets", aiRoutes);
app.use("/api/v1/tickets/:ticketId/messages", messageRoutes);
app.use("/api/v1/tickets/:ticketId/notes", noteRoutes);
app.use("/api/v1/organizations/:orgId/kb", kbRoutes);
app.use("/api/v1/tickets/:ticketId/activity", activityRoutes);
app.use((_req, res) => {
    res.status(404).json({
        message: "Route not found"
    });
});
app.use(errorHandler);
