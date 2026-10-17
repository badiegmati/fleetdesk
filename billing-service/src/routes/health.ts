import { Router } from "express";
import { config } from "../config";

export const healthRouter = Router();

healthRouter.get("/health", (_req, res) => {
  res.status(200).json({
    status: "ok",
    service: "fleetdesk-billing-service",
    mail_enabled: config.smtp.enabled,
    timestamp: new Date().toISOString(),
  });
});
