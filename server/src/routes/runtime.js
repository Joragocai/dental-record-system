import express from "express";
import runtimeConfig from "../config/runtimeConfig.js";

const router = express.Router();

router.get("/status", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json({
    mode: runtimeConfig.mode,
    isDemoMode: runtimeConfig.isDemoMode,
    automaticBackupEnabled: runtimeConfig.autoBackupEnabled
  });
});

export default router;
