import express from "express";
import runtimeConfig from "../config/runtimeConfig.js";
import { clearDemoData, getDemoDataStatus, loadDemoData } from "../demo/demoEnvironment.js";

const router = express.Router();

router.get("/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    mode: runtimeConfig.mode,
    isDemoMode: runtimeConfig.isDemoMode,
    automaticBackupEnabled: runtimeConfig.autoBackupEnabled
  });
});

function requireLocalDemoRequest(req, res, next) {
  if (!runtimeConfig.isDemoMode) {
    return res.status(403).json({ message: "Demo data controls are unavailable outside demo mode." });
  }
  const origin = req.get("Origin");
  if (!origin || !["http://localhost:5173", "http://127.0.0.1:5173"].includes(origin)) {
    return res.status(403).json({ message: "A local presentation browser origin is required." });
  }
  if (req.get("Content-Type")?.split(";")[0].trim() !== "application/json") {
    return res.status(415).json({ message: "JSON content type is required." });
  }
  next();
}

router.get("/demo-data", (_req, res) => {
  if (!runtimeConfig.isDemoMode) return res.status(403).json({ message: "Unavailable outside demo mode." });
  res.set("Cache-Control", "no-store");
  res.json(getDemoDataStatus());
});

router.post("/demo-data/load", requireLocalDemoRequest, async (req, res) => {
  if (req.body?.confirmation !== "LOAD DEMO DATA") {
    return res.status(400).json({ message: "Confirmation is required." });
  }
  try {
    res.set("Cache-Control", "no-store");
    res.json(await loadDemoData());
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Unable to load demo data." });
  }
});

router.post("/demo-data/clear", requireLocalDemoRequest, async (req, res) => {
  if (req.body?.confirmation !== "CLEAR DEMO DATA") {
    return res.status(400).json({ message: "Confirmation is required." });
  }
  try {
    res.set("Cache-Control", "no-store");
    res.json(await clearDemoData());
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || "Unable to clear demo data." });
  }
});

export default router;
