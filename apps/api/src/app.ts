import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";

export const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(morgan("dev"));

app.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "supportiq-api"
  });
});

app.use((_req, res) => {
  res.status(404).json({
    message: "Route not found"
  });
});