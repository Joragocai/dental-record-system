import express from "express";
import { getPostgresPool } from "../db/postgres/pool.js";
import { cloudDemoStatus, cloudDemoDataStatus, mutateCloudDemo } from "../demo/cloudDemoService.js";
export function createCloudDemoRouter(pool = null, env = process.env) {
  const router = express.Router();
  const activePool = async () => pool || getPostgresPool();
  router.get("/runtime/status", async (_req, res, next) => {
    try { res.set("Cache-Control", "no-store"); res.json(await cloudDemoStatus(await activePool(), env)); }
    catch (error) { next(error); }
  });
  router.get("/runtime/demo-data", async (_req, res, next) => {
    try { res.set("Cache-Control", "no-store"); res.json(await cloudDemoDataStatus(await activePool(), env)); }
    catch (error) { next(error); }
  });
  for (const [action, confirmation] of [["fill", "LOAD DEMO DATA"], ["clear", "CLEAR DEMO DATA"]]) {
    router.post("/runtime/demo-data/" + (action === "fill" ? "load" : "clear"), async (req, res, next) => {
      try {
        if (req.is("application/json") !== "application/json") return res.status(415).json({message:"JSON content type is required."});
        if (req.body?.confirmation !== confirmation) return res.status(400).json({message:"Confirmation is required."});
        res.set("Cache-Control", "no-store");
        res.json(await mutateCloudDemo({pool:await activePool(), operation:action, env}));
      } catch (error) { next(error); }
    });
  }
  return router;
}
